# Build your own RL system

Use River's core sampling and training methods when your experiment needs a
custom rollout schedule, advantage estimator, data mixture, or update rule.
You choose what to sample, how to turn it into training data, and when to update
the model. River executes the forward, backward, and optimizer operations.

This chapter assumes you understand the RL loop. It focuses on the boundary
between your algorithm and the training service. The snippets operate inside an
existing training session, with `model` referring to a live River model.

## Choose the controls your algorithm needs

| Decision | Your code controls | River interface |
| --- | --- | --- |
| Which tasks to attempt | Curriculum, replay selection, group sizes | `model.sample(...)` |
| How to generate attempts | Prompt tokens, sampling settings, stopping conditions | `prompt_token_ids`, `temperature`, `max_tokens`, `stop` |
| What receives credit | Rewards, baselines, per-token advantages, masks | Training datum fields |
| How contributions combine | Normalization, microbatches, SFT/RL mixtures | `forward_backward(..., zero_out=...)` |
| When weights change | Update frequency, learning-rate schedule, clipping | `optim_step(...)` |
| How work overlaps | Admission, completion handling, policy-age limits | `submit_*`, `submit_sampling_batch(...)` |

Choose a [built-in loss](/guides/losses/) and configure its parameters. You can
implement new sampling, credit-assignment, and scheduling techniques around
those losses. The API does not accept arbitrary Python loss functions, custom
autograd code, or arbitrary optimizer implementations. A technique that requires
a different server-side derivative needs an additional loss implementation.

If only the reward or environment changes, the [RL library](/python-api/#reinforcement-learning)
already supplies the surrounding loop. Moving to core primitives means your
code also owns trajectory bookkeeping, normalization, policy provenance, and
recovery.

## Sample exactly the context you will train on

For a text-only experiment, render each conversation with the model's chat
format and tokenize it once. Let `prompt_ids` be the resulting nonempty token
lists, one per task. Pass those IDs directly to sampling:

```python
groups = model.sample(
    prompt_token_ids=prompt_ids,
    num_samples=4,
    max_tokens=1024,
    temperature=1.0,
    top_p=1.0,
    top_k=-1,
    seed=0,
)
```

The result is indexed by prompt, then sample. Each `Sample` carries generated
`tokens`, chosen-token `logprobs`, `stop_reason`, and `policy_version`. Chosen-token
log probabilities are returned without setting `logprobs=K`; that option asks
for alternative top-K tokens and adds work you usually do not need for an RL
update.

These settings avoid temperature rescaling and top-p/top-k filtering in the
initial experiment. When changing the sampling distribution, verify how the
sampler reports log probabilities and how your objective uses them. Supplying
`old_logprobs` alone does not make every sampling transformation an exact
importance correction.

Keep the prompt IDs, generated IDs, original log probabilities, policy version,
and generation settings with each rollout. Score readable text if appropriate,
but construct training data from the recorded tokens. Decoding and retokenizing
a response can change the sequence. A `Sample` with `token_data_is_exact=False`
is unsuitable for an update that relies on exact rollout alignment.

Use `stop_reason` to apply your truncation policy before constructing a batch.
Dropping incomplete attempts, assigning them zero reward, and training on their
partial work produce different datasets. For group-relative estimators, decide
whether excluded attempts still participate in the baseline.

## Supply your own per-token signal

Your estimator produces an advantage for each generated token. A trajectory-level
estimator can broadcast one scalar across the response; a process reward or
credit-assignment method can assign different values to different spans. Preserve
the grouping needed by your estimator even if results arrive out of order.

The training service consumes fields aligned to **prediction positions**. If a
prompt has *P* tokens and a response has *C* tokens, the first response token is
predicted at position *P − 1*. The last input position has no next-token target.

| Field | Prompt-only predictions: `0 … P−2` | Response predictions: `P−1 … P+C−2` | Final slot |
| --- | --- | --- | --- |
| `old_logprobs` | 0 | Recorded generated-token log probabilities | 0 |
| `advantages` | 0 | Your generated-token advantages | 0 |
| `attention_mask` | 1 | 1 | 1 |

A zero advantage removes that position's direct RL loss contribution. It does
not remove the token from the context seen by later predictions. The attention
mask is not the loss mask.

This helper builds one text-only datum. `token_advantages` is your algorithm's
vector for this sample, with one value per generated token:

```python
def make_datum(prompt, sample, token_advantages):
    if not prompt:
        raise ValueError("A training prompt must contain at least one token")
    if not sample.token_data_is_exact:
        raise ValueError("Training requires exact sampled token data")
    if len(sample.tokens) != len(sample.logprobs):
        raise ValueError("Sampled tokens and log probabilities must align")
    if len(token_advantages) != len(sample.tokens):
        raise ValueError("Supply one advantage per generated token")

    ids = prompt + sample.tokens
    return {
        "input_ids": ids,
        "attention_mask": [1] * len(ids),
        "old_logprobs": [0.0] * (len(prompt) - 1) + sample.logprobs + [0.0],
        "advantages": [0.0] * (len(prompt) - 1) + token_advantages + [0.0],
    }
```

`target_tokens` is omitted: the server derives next-token targets from
`input_ids`. For a scalar advantage `a`, pass `[a] * len(sample.tokens)`.
For selective credit, zero the generated positions you intend to exclude.

Now build `batch` by applying this helper to the samples your algorithm retains.
Keep record metadata—task identity, policy version, reward components, and
completion status—alongside the batch. Those records let you audit the estimator
and reconstruct why a sample contributed to an update.

The concatenation above covers a single text response. In a multi-turn rollout,
keep model-generated spans separate from tool and user messages. Train each
span against the context that produced it. For images, preserve image chunks
and their alignment as well as text tokens. The RL library's
[`Trajectory`](/python-api/#rltrajectory) represents these records; replacing
the optimizer loop does not require replacing that representation.

## Make batch weighting explicit

The core losses sum token contributions. Neither a request boundary nor an
optimizer call implicitly turns that sum into the average your algorithm may
intend. Decide the denominator across the **whole logical update**.

Let `N` be the number of response tokens included in your normalization, `B` the
number of retained responses, and `Cᵢ` the included token count for response *i*:

| Objective weighting | How to implement it |
| --- | --- |
| Sum over tokens | Leave advantages unscaled. |
| Mean over included tokens | Scale all contributions by `1 / N`. |
| Equal response weight | Scale response *i*'s advantages by `1 / (B × Cᵢ)`. |
| Weighted tasks or data sources | Apply your task weights, then the chosen denominator. |

Define which tokens count in these denominators. For example, removing
zero-advantage groups and then dividing by the remaining token count changes
update scale compared with keeping them in the denominator. A sequence with
zero included tokens has no term in a per-sequence mean.

You can incorporate these factors into `advantages` before submission. For a
single global factor, `optim_step(gradient_scale=...)` scales accumulated
gradients before gradient clipping and Adam. It requires endpoint support for
`gradient_scale_v1`; the client exposes that through
`model.get_server_capabilities().require("gradient_scale_v1")`.

> [!WARNING]
>
> **Normalize each factor once.** Use one normalization path for a given factor. Dividing the advantages by `N`
> and also passing `gradient_scale=1 / N` divides twice. Per-sequence factors must
> be applied to each sequence; one final scalar cannot reproduce unequal weights.

## Accumulate microbatches, then update once

Separate the logical training batch from its transport batches. The following
function takes nonempty `batch` data from `make_datum`. `normalization_tokens`
is the positive denominator selected by your algorithm; advantages have not
already been divided by it.

```python
def apply_update(model, batch, normalization_tokens, lr):
    if not batch or normalization_tokens <= 0:
        raise ValueError("Skip updates with no training contribution")
    model.get_server_capabilities().require("gradient_scale_v1")
    policy = model.get_policy_version()
    if policy is None:
        raise RuntimeError("This loop requires committed policy versions")

    microbatch_size = 8
    for start in range(0, len(batch), microbatch_size):
        model.forward_backward(
            batch[start : start + microbatch_size],
            loss_fn="cispo",
            eps_max=6.0,
            zero_out=(start == 0),
            expected_policy_id=policy.id,
        )

    return model.optim_step(
        lr=lr,
        beta1=0.9,
        beta2=0.95,
        eps=1e-8,
        weight_decay=0.0,
        grad_clip_norm=1.0,
        gradient_scale=1.0 / normalization_tokens,
        expected_policy_id=policy.id,
    )
```

`zero_out=True` clears existing gradients on the first microbatch. Later calls
use `False` to accumulate. One optimizer step applies the aggregate. Using
`True` on every call discards earlier contributions; taking an optimizer step
per microbatch changes the weights between contributions and implements a
different algorithm. The learning-rate schedule should advance on the logical
updates your algorithm defines.

This example waits for each forward/backward result before proceeding. If one
fails, it does not submit an optimizer step. Resolve the failed operation before
restarting the logical batch, and reset gradients on that batch's first call.

`model.train_step(...)` is useful when you want a complete update in one call.
It clears gradients and pipelines forward/backward with the optimizer operation.
Use the separate methods when you need accumulation, inspection, or a decision
between those operations. For requests within the normal upload limit,
`train_step` submits the optimizer before the backward result is known; its
failure behavior is therefore different from the loop above.

## Change the algorithm at a specific boundary

<figure class="docs-learning-figure">
<div class="docs-flow">
<div><strong>Collect records</strong><small>Tasks, sampled tokens, behavior policy, and outcomes.</small></div>
<span aria-hidden="true">→</span>
<div class="docs-model"><strong>Construct the update</strong><small>Select data, assign credit, normalize, and accumulate.</small></div>
<span aria-hidden="true">→</span>
<div><strong>Commit weights</strong><small>Apply one optimizer step; record the resulting policy.</small></div>
</div>
<figcaption>Keep the records fixed while testing an estimator, or keep the estimator fixed while testing a collection strategy.</figcaption>
</figure>

Here are experiments you can implement without changing the training service:

- **Curriculum or adaptive group size:** change task selection and samples per
  task before sampling. Record the selection rule so evaluation still measures
  the intended task distribution.
- **Reward shaping or a new baseline:** change your estimator before creating
  `token_advantages`. Preserve reward components and raw scores so you can
  separate estimator effects from verifier changes.
- **Process credit or span selection:** change the per-token advantages and
  masks. Keep the original context and log probabilities for the included spans.
- **Replay or multiple updates per rollout batch:** reuse recorded trajectories
  while preserving their original `old_logprobs`. Re-read the current training
  policy before each update and enforce your policy-age rule. Replacing old
  log probabilities with current ones would change the estimator.
- **SFT/RL mixtures:** accumulate an SFT contribution with `cross_entropy`, then
  an RL contribution with `zero_out=False`, followed by one optimizer step.
  Set each objective's normalization and mixture coefficient explicitly through
  `weights` or `advantages`. Two separate optimizer steps are not the same as
  one step on the combined gradient.

`model.forward(...)` evaluates a supported loss without accumulating gradients.
Use it for objective diagnostics on a fixed batch. Per-token log probabilities
are available when the worker returns them; check the result before depending
on them. A forward call is not an interface for sending a custom backward pass.

## Schedule sampling and training independently

Start with one owner of the model's training sequence. `submit_*` methods let
that owner submit work and collect results later without having several drivers
race to update the same weights.

| Interface | Completion model | Useful for |
| --- | --- | --- |
| `sample(...)` | Wait for all samples | Establishing a synchronous baseline |
| `submit_sample(...)` | One pending result for the batch | Doing independent driver work while sampling runs |
| `submit_sampling_batch(...)` | Independent sample results | Custom admission, straggler handling, and multi-turn scheduling |
| `submit_forward_backward(...)` | Pending backward result | Queuing gradient contributions in order |
| `submit_optim_step(...)` | Pending update result | Tracking completion of a submitted update |

The independent sampling API accepts up to 128 samples per submission, including
the expansion from `num_samples`. Its completion iterator is asynchronous:

```python
async def collect_samples(model, prompt_ids):
    pending = model.submit_sampling_batch(
        prompt_token_ids=prompt_ids,
        num_samples=4,
        max_tokens=1024,
        temperature=1.0,
        return_prompt_token_ids=True,
    )
    async for result in pending.as_completed():
        if result.error is not None:
            raise result.error
        yield result.prompt_index, result.sample_index, result.sample
```

The caller supplies at most 32 prompts for this four-sample example. Feed results
into your own group assembler using the original prompt and sample indexes;
completion order is not group order. A ready sample is not necessarily a ready
training group. Your estimator determines when the group has enough information.
Do not turn infrastructure failures into zero task rewards by accident.

The iterator reports results independently; it does not define a training
schedule. Cancelling a local wait does not cancel accepted server operations.
Keep request IDs and resolve outstanding operations before replaying uncertain
work or recovering a driver.

For microbatches submitted asynchronously, keep the first gradient reset ahead
of every accumulation call and collect all required backward results before
submitting an update that must depend on their success. The nonblocking
`submit_forward_backward` rejects requests above its upload limit; use blocking
`forward_backward` for the client's automatic splitting at datum boundaries.

## Select and track the sampling policy

Low-level asynchronous sampling requires an explicit weight-version strategy:

| Sampling choice | Behavior |
| --- | --- |
| Default `policy_selection="ordered"` | Preserve ordering with queued training work. |
| `policy_selection="latest_snapshot"` | Use the newest available immutable committed snapshot without waiting for queued training. Publish one with `save_weights(..., mode="inference", immutable=True)` first. |
| `pinned_policy_id=...` | Continue a previously returned sampling policy; cannot be combined with `latest_snapshot`. |

These options belong to `submit_sampling_batch` and require server support.
A latest snapshot may lag the committed training head. Publishing snapshots,
bounding their age, and deciding when to wait or drop data are parts of your
algorithm, not consequences of choosing a nonblocking call.

Use `Sample.policy_version` as the behavior-policy identity and
`OptimStepResult.policy_version` as the committed result of an update.
`model.get_policy_version()` reads the committed training policy. `model.step`
advances at optimizer submission time, even if the operation later fails; it is
not confirmation that the update committed.

Before training, check that rollout versions belong to the intended lineage
and meet your age bound. `expected_policy_id` guards the weights used for a
training operation; it does not enforce a staleness rule over your data. Record
both the behavior policy and training policy for each contribution.

For mixed-policy trajectories or retained KV, track versions per generated span
and distinguish sampling-policy age from cache age. The
[policy chapter](/guides/rl-policies/) details those choices. Training and
sampling MoE models can also involve routing differences: the API exposes
`return_expert_routing`, `Sample.routing_datum_keys(required=True)`,
`compute_expert_flip_metric`, and `force_routing_replay` for supported models.
Use these controls when routing consistency is part of the experiment, and
keep each capture tied to its sampled sequence.

## Make the custom loop inspectable

For each logical update, retain the tasks and sampling settings, original
rollout records, rewards, selected spans, normalization denominator, loss
configuration, optimizer settings, and committed policy identity. This lets you
compare algorithms on the same data and diagnose an unexpected gradient or
change in reward.

Test data construction and update scheduling on a tiny recorded batch before
scaling out. Verify that changing only the microbatch partition preserves the
intended weighting, that prompt and tool tokens receive no direct RL loss, and
that failed backward work cannot accidentally trigger a partial update.

A weight checkpoint alone does not save your custom scheduler, replay buffer,
data position, or outstanding operations. Persist those alongside the run if
you need recovery. Use [Evaluation and recovery](/guides/rl-checkpoints/) for the
library-managed alternative, and compare saved policies on a fixed holdout
before attributing gains to your new technique.

For a worked application of these controls, [Distill a larger model](/guides/distillation-basics/)
uses teacher probabilities to construct token-level updates, including
self-distillation and multi-teacher training.
