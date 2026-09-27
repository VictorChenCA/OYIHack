# Distill a larger model

Train a smaller student on its own responses using a stronger teacher's
probabilities. This chapter explains the KL objective and builds the shared
`score_response` and `distill_step` helpers used by the later examples.

## Understand what KL compares

At one response prefix, let **p** be the student's next-token distribution and
**q** the teacher's. Both distributions must describe the same token vocabulary.
KL divergence measures their disagreement, but its direction matters:

<div class="docs-equation">Forward KL: D<sub>KL</sub>(q ∥ p) = Σ<sub>v</sub> q(v) [log q(v) − log p(v)]</div>

<div class="docs-equation">Reverse KL: D<sub>KL</sub>(p ∥ q) = Σ<sub>v</sub> p(v) [log p(v) − log q(v)]</div>

Forward KL weights discrepancies by teacher probability. With a fixed teacher,
its gradient is the same as cross-entropy against the teacher's soft targets.
Reverse KL weights discrepancies by student probability: it penalizes choices
the student makes that the teacher considers unlikely. These objectives can
behave differently when a small student cannot represent all the teacher's
behaviors. [MiniLLM](https://arxiv.org/abs/2306.08543) develops reverse-KL
distillation for this setting.

On-policy training evaluates these comparisons on **student-generated
prefixes**. A teacher must therefore score a response even when it would never
have generated that response itself. Asking the teacher for an independent
answer does not supply the probabilities needed for this update.

<figure class="docs-learning-figure">
<div class="docs-flow">
<div class="docs-model"><strong>Student attempts</strong><small>Generate tokens from the current student policy.</small></div>
<span aria-hidden="true">→</span>
<div><strong>Teacher scores</strong><small>Read the same response prefixes and score the sampled tokens.</small></div>
<span aria-hidden="true">→</span>
<div><strong>Student updates</strong><small>Use token-level feedback, then generate fresh attempts.</small></div>
</div>
<figcaption>The teacher can be larger, specialized, or given extra context. The student still supplies the trajectory.</figcaption>
</figure>

### Turn sampled probabilities into an update

For a student-generated token, form a detached advantage:

<div class="docs-equation">A<sub>t</sub> = log q(y<sub>t</sub> | teacher context, y<sub>&lt;t</sub>) − log p(y<sub>t</sub> | student context, y<sub>&lt;t</sub>)</div>

If the teacher assigns probability 0.4 and the student assigns 0.1, the advantage
is log(4), about +1.39. If those probabilities are reversed, it is −1.39. The
update encourages or discourages that token in the student's context.

At a fixed prefix, sampling from p and using this detached advantage in a policy
gradient gives the negative gradient of reverse KL in expectation. We refresh
prefixes after each update and treat them as fixed during that update. This is
a local token-level surrogate; it does not differentiate through the changing
distribution of whole trajectories. See the practical treatment in
[Thinking Machines Lab's OPD walkthrough](https://thinkingmachines.ai/blog/on-policy-distillation/).

Do not replace this signal with group-normalized correctness scores: its scale
and sign carry teacher information. Clipping advantages, adding outcome
rewards, or reusing rollouts are additional algorithm choices. MiMo's published
recipe also handles training–inference mismatch and mixes outcome feedback;
our synchronous baseline leaves those extensions explicit.

## Score and train with River

> [!WARNING]
>
> **Check tokenization before scoring.** The following helpers operate on live River model handles. `student` and every
> teacher must use compatible token IDs and tokenization. Matching vocabulary
> sizes is insufficient. Check token mappings, special tokens, and encoding on
> your task data before using a large/small model pair. If their tokenizations
> differ, begin with teacher-generated text and SFT.

Use temperature 1 without top-p or top-k truncation for this baseline. Preserve
the sampled IDs rather than decoding and retokenizing them. `forward` scores
explicit next-token targets without accumulating gradients:

```python
import math

def score_response(model, prompt_ids, response_ids, policy_id):
    ids = prompt_ids + response_ids
    start = len(prompt_ids) - 1
    result = model.forward(
        [{
            "input_ids": ids,
            "target_tokens": ids[1:] + [0],
            "weights": [0.0] * start + [1.0] * len(response_ids) + [0.0],
        }],
        loss_fn="cross_entropy",
        expected_policy_id=policy_id,
    )
    if result.logprobs is None or len(result.logprobs) != 1:
        raise RuntimeError("Teacher scoring requires per-token forward logprobs")
    values = [
        float(value)
        for value in result.logprobs[0][start : start + len(response_ids)]
    ]
    if len(values) != len(response_ids) or not all(map(math.isfinite, values)):
        raise ValueError("Missing or invalid response scores")
    return values
```

> [!WARNING]
>
> **Align prediction positions, not prompt lengths.** The first response target sits at `len(prompt_ids) - 1`. Teacher and student
> prompts may have different lengths, so slice each scoring result using its own
> prompt length. The final input position has no next-token target and is masked.

`records` below contains tuples of `(student_prompt_ids, teacher_model,
teacher_prompt_ids)`. All scores are collected before any update. Keep one
owner of the student's training sequence and leave external teachers unchanged.

```python
def distill_step(student, records, lr=1e-5):
    if not records:
        raise ValueError("Supply at least one task")
    policy = student.get_policy_version()
    if policy is None:
        raise RuntimeError("This loop requires committed policy versions")
    batch = []

    for prompt_ids, teacher, teacher_prompt_ids in records:
        if not prompt_ids or not teacher_prompt_ids:
            raise ValueError("Both contexts must contain tokens")
        sample = student.sample(
            prompt_token_ids=prompt_ids,
            num_samples=1,
            max_tokens=512,
            temperature=1.0,
            top_p=1.0,
            top_k=-1,
        )[0][0]
        if not sample.token_data_is_exact or not sample.tokens:
            raise ValueError("Need a nonempty response with exact token data")
        if sample.policy_version is None or sample.policy_version.id != policy.id:
            raise ValueError("Collect a fresh batch from the committed student")
        if len(sample.logprobs) != len(sample.tokens):
            raise ValueError("Sampling probabilities must align with tokens")
        if not all(map(math.isfinite, sample.logprobs)):
            raise ValueError("Sampling probabilities must be finite")

        teacher_policy = teacher.get_policy_version()
        if teacher_policy is None:
            raise RuntimeError("Record a committed teacher policy")
        teacher_lp = score_response(
            teacher, teacher_prompt_ids, sample.tokens, teacher_policy.id
        )
        student_lp = score_response(student, prompt_ids, sample.tokens, policy.id)
        # Equal response weight, then a mean over tokens within each response.
        scale = 1.0 / (len(records) * len(sample.tokens))
        advantages = [
            (q - p) * scale for q, p in zip(teacher_lp, student_lp, strict=True)
        ]
        ids = prompt_ids + sample.tokens
        prefix = [0.0] * (len(prompt_ids) - 1)
        batch.append({
            "input_ids": ids,
            "target_tokens": ids[1:] + [0],
            "old_logprobs": prefix + sample.logprobs + [0.0],
            "advantages": prefix + advantages + [0.0],
        })

    student.forward_backward(
        batch,
        loss_fn="importance_sampling",
        zero_out=True,
        expected_policy_id=policy.id,
    )
    return student.optim_step(
        lr=lr, grad_clip_norm=1.0, expected_policy_id=policy.id
    )
```

The Python numbers are detached supervision. `old_logprobs` contains the
student sampler's probabilities; the teacher probabilities belong in the
advantage. A separate student forward pass computes the training policy's
probabilities. River's importance ratio accounts for the local difference
between sampler and trainer; it cannot repair arbitrary trajectory staleness.

This loop takes one update per fresh batch, normalizes once through advantages,
and waits for backward success before submitting the optimizer. The learning
rate and 512-token budget are starting values, not researched optimums. Longer
reasoning tasks need a larger budget and explicit treatment of truncated
responses. For larger batches, use the accumulation and recovery controls in
[Build your own RL system](/guides/rl-primitives/).

## Distill a larger model into a smaller one

Create a small student and a stronger teacher, then call the shared loop. For
example, `Qwen/Qwen3.5-9B` and `Qwen/Qwen3.5-122B-A10B-FP8` are model names in
River's [catalog](/guides/models/). Confirm account access and tokenizer
compatibility for the exact revisions you select. Model size alone does not
establish that the teacher is better at your task.

Inside a live session, after preparing compatible tokenized task prompts:

```python
student = session.create_model(
    base_model="Qwen/Qwen3.5-9B", lora=river.LoraConfig(rank=8)
)
teacher = session.create_model(
    base_model="Qwen/Qwen3.5-122B-A10B-FP8", lora=river.LoraConfig(rank=8)
)
records = [(ids, teacher, ids) for ids in prompt_batch]
result = distill_step(student, records)
```

Here `river` is `river_client`, and `prompt_batch` is a nonempty list of token
lists produced with the models' compatible chat formatting. The teacher receives
no optimizer updates. Replace it with a validated specialist checkpoint when
the base model is not a strong enough teacher. Compare the student's initial
policy, teacher, SFT baseline, and distilled checkpoints on the same holdout.

## Evaluate the transfer

Distillation loss measures agreement, not task success. Track held-out outcomes,
response length, inference cost, per-domain performance, and retained general
capabilities. A smaller model can imitate a teacher's style while missing the
skill you wanted to transfer.

Before increasing concurrency, verify one recorded response end to end: exact
tokens, both contexts, aligned probabilities, advantage signs, teacher version,
and student version. Then compare the SFT baseline, sampled OPD, and any richer
objective at matched training and teacher-compute budgets.

> [!WARNING]
>
> **Choose the estimator and API together.** Full-vocabulary external-teacher
> reverse KL needs more than sampled probabilities. Soft targets can use
> multi-target `cross_entropy`, but renormalizing top-k drops tail mass and changes
> the target. It is not MiMo's corrected top-k reverse-KL loss. River's native
> [`opsd` loss](/guides/distillation-opsd/) covers same-model forward KL.
> See [Loss functions](/guides/losses/) for the contracts.
