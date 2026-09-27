# Asynchronous RL training

Keep generating rollouts while the trainer updates the model. Asynchronous RL
lets sampling work ahead by a bounded number of policy versions, which is useful
when trajectories take different amounts of time or spend time waiting on tools.

## Start from the synchronous example

In the [synchronous example](/guides/rl-sync/#training-recipe), change two constants:

```python
MAX_STALENESS = 2
CONCURRENCY = 192
```

`MAX_STALENESS` sets the trainer's policy-age bound; `CONCURRENCY` sets the
engine's rollout concurrency. `Schedule` defaults to `admit_ahead=2`. The
environment, reward, group size, and optimizer stay the same.

With 64 trajectories per training batch, 192 concurrent trajectories leaves
room for the current batch and up to two more batches of work. These settings
control client admission; they do not allocate more GPUs. Choose concurrency
that your environment and available API capacity can use.

## What changes in the loop

In synchronous mode, batch B begins sampling after batch A's optimizer update.
In asynchronous mode, B can already be sampling while A is training. B may
therefore contain responses from an older policy than the one used for its
forward/backward computation.

<figure class="docs-diagram">
<svg viewBox="0 0 900 450" role="img" aria-labelledby="overlap-title overlap-desc">
<title id="overlap-title">Synchronous and asynchronous sampling timelines</title>
<desc id="overlap-desc">In synchronous training, batch B sampling starts after the optimizer update for batch A. Ready groups within A can already overlap sampling and forward/backward. In asynchronous training, batch B samples with policy 10 while A trains, then B trains against policy 11. Batch C similarly samples with policy 11 while B trains against policy 11, then trains against policy 12.</desc>
<text x="24" y="35" class="diagram-heading">Synchronous</text>
<text x="24" y="82">Sampling</text>
<text x="24" y="144">Trainer</text>
<rect x="145" y="57" width="185" height="40" rx="6" class="diagram-sample"/><text x="237.5" y="82" text-anchor="middle">A · policy 10</text>
<rect x="470" y="57" width="185" height="40" rx="6" class="diagram-sample"/><text x="562.5" y="82" text-anchor="middle">B · policy 11</text>
<rect x="305" y="119" width="140" height="40" rx="6" class="diagram-train"/><text x="375.0" y="144" text-anchor="middle">A · F/B</text>
<rect x="630" y="119" width="140" height="40" rx="6" class="diagram-train"/><text x="700.0" y="144" text-anchor="middle">B · F/B</text>
<rect x="445" y="119" width="25" height="40" rx="6" class="diagram-update"/><text x="457.5" y="144" text-anchor="middle"></text>
<rect x="770" y="119" width="25" height="40" rx="6" class="diagram-update"/><text x="782.5" y="144" text-anchor="middle"></text>
<line x1="470" y1="49" x2="470" y2="172" class="diagram-boundary"/>
<text x="480" y="190" class="diagram-note">policy 11</text>
<text x="145" y="218" class="diagram-note">Ready groups can train while the rest of their batch is still sampling.</text>
<line x1="24" y1="240" x2="876" y2="240" class="diagram-line"/>
<text x="24" y="273" class="diagram-heading">Asynchronous</text>
<text x="24" y="321">Sampling</text>
<text x="24" y="383">Trainer</text>
<rect x="145" y="296" width="155" height="40" rx="6" class="diagram-sample"/><text x="222.5" y="321" text-anchor="middle">A · policy 10</text>
<rect x="300" y="296" width="200" height="40" rx="6" class="diagram-sample"/><text x="400.0" y="321" text-anchor="middle">B · policy 10</text>
<rect x="500" y="296" width="200" height="40" rx="6" class="diagram-sample"/><text x="600.0" y="321" text-anchor="middle">C · policy 11</text>
<rect x="300" y="358" width="120" height="40" rx="6" class="diagram-train"/><text x="360.0" y="383" text-anchor="middle">A · F/B</text>
<rect x="500" y="358" width="120" height="40" rx="6" class="diagram-train"/><text x="560.0" y="383" text-anchor="middle">B · F/B</text>
<rect x="700" y="358" width="120" height="40" rx="6" class="diagram-train"/><text x="760.0" y="383" text-anchor="middle">C · F/B</text>
<rect x="420" y="358" width="20" height="40" rx="6" class="diagram-update"/><text x="430.0" y="383" text-anchor="middle"></text>
<rect x="620" y="358" width="20" height="40" rx="6" class="diagram-update"/><text x="630.0" y="383" text-anchor="middle"></text>
<rect x="820" y="358" width="20" height="40" rx="6" class="diagram-update"/><text x="830.0" y="383" text-anchor="middle"></text>
<line x1="440" y1="338" x2="440" y2="410" class="diagram-boundary"/>
<line x1="640" y1="338" x2="640" y2="410" class="diagram-boundary"/>
<text x="446" y="431" class="diagram-note">policy 11</text>
<text x="646" y="431" class="diagram-note">policy 12</text>
<text x="856" y="431" class="diagram-note" text-anchor="end">time →</text>
</svg>
<figcaption>F/B = forward/backward. The narrow solid blocks are optimizer updates. Each sampling bar represents a batch; lengths show ordering, not measured duration.</figcaption>
</figure>

| Control | Meaning |
| --- | --- |
| `AsyncTrainer.max_staleness` | Maximum allowed policy age, measured in optimizer updates. |
| `Schedule.admit_ahead` | How many future batches the engine may admit, subject to the staleness bound. |
| `Schedule.concurrency` | Maximum active trajectories, including those running tools. |
| `Schedule.max_sample_requests` | Maximum outstanding sampling prompts; defaults to `concurrency`. |

Each sampled segment records the policy that generated it. With
`max_staleness=2`, a segment generated by policy 10 can train against policy
10, 11, or 12. It cannot train against policy 13 under the default wait policy.
The optimizer update following forward/backward advances the policy again.

### Slow trajectories make the trainer wait

The default `stale_policy="wait"` holds back optimizer progress when an
outstanding group would otherwise become too old. Sampling and tool calls
continue during that wait. A long trajectory keeps its opportunity to train.

The bound applies to **every generated segment**, including early turns of a
long conversation. A later turn sampled with newer weights does not make the
earlier turns younger. The trainer may need to wait before the age limit is
reached if several outstanding groups must still fit into the remaining updates.

Start with the wait policy. Masking old spans or allowing unbounded age changes
which learning signal reaches training and requires explicit configuration.

## Synchronous overlap is a different setting

You do not need policy staleness to overlap sampling with forward/backward.
The synchronous recipe already supports that **within one batch**:

| Mode | Sampling during forward/backward | Sampling ahead across updates |
| --- | --- | --- |
| Synchronous, group-centered | Ready groups can train while other groups finish. | No. |
| Asynchronous | Future groups can sample while a completed batch trains. | Yes, within `max_staleness`. |

`forward_backward_batch="auto"` chooses the supported path. Leave it at its
default when switching between these modes. Explicit
`ForwardBackwardBatch(...)` settings are for synchronous group-centered overlap
and cannot be combined with positive `max_staleness`.

For synchronous workloads, you can tune submission size separately from
optimizer-batch size:

```python
# AsyncTrainer option for a synchronous run:
forward_backward_batch = rl.ForwardBackwardBatch(
    min_sequences=32,
    min_tokens=65_536,
)
```

Either threshold triggers submission; complete groups stay together. Smaller
chunks can begin earlier but create more requests. Batch-centered advantages
(`rl.Batchwise`) need the full batch's rewards, so the automatic path waits for
those rewards before forward/backward.

## Keep one policy per trajectory to start

Async training still defaults to `sampling_policy="trajectory"`: a rollout
keeps the policy that started it, even while other groups train. Multi-turn
rollouts can reuse their existing prefix under that policy.

A turn can span several sampling requests, or **segments**. With trajectory
pinning, every segment uses the same policy. With `sampling_policy="segment"`,
later requests can use newer policies—even within the same assistant turn.

The [policy and trajectory guide](/guides/rl-policies/) compares both modes
visually, along with staleness handling and group completion options.

This is separate from the training-age limit. The trainer can be two versions
ahead while a trajectory continues on its original policy. The wait policy
prevents it from advancing beyond what the outstanding trajectories can use.

For very long conversations, you can instead let later turns use newer weights
while retaining bounded-age KV. That is covered in
[Policy versions and trajectory control](/guides/rl-policies/#keep-older-kv-or-rebuild-the-prefix).

## Measure the effect

Compare the two modes at the same task and batch size, using reward and
evaluation quality alongside timing. Faster updates alone do not establish
better training.

| Metric in `step.metrics` | Use |
| --- | --- |
| `train/batch_seconds` | Time to consume and train a batch. |
| `sampling/generated_tokens_per_second` | Sampling output over the whole logging interval, including training and caller time. |
| `staleness/span_age_p50`, `staleness/span_age_p99` | Policy ages of generated spans in the consumed batch. |
| `staleness/wait_seconds` | Time spent waiting to preserve the staleness bound despite having a ready batch. |
| `staleness/reserved_groups` | Outstanding groups still owed training. |

> [!WARNING]
>
> **More lookahead does not remove the freshness tradeoff.** If staleness waits dominate, inspect long trajectories and tool latency. More
> lookahead cannot eliminate a wait while keeping the same age bound. Increasing
> `max_staleness` trades fresher data for more scheduling freedom; measure its
> effect on held-out reward.

`step.metrics` already includes sampling counters. Send that dictionary to your
logger; you do not need to poll the engine separately. Sampling metrics cover
the interval since the previous result, including work on future batches.
Reward and training metrics describe the batch being consumed. Evaluation uses
its own engine and is recorded separately.

### Oversampling

`Schedule(oversample_factor=1.5, ...)` admits extra whole groups so the trainer
has more completed groups to choose from. Surplus groups remain eligible for
later updates. They share the same concurrency and staleness limits, so
oversampling does not create an unlimited queue or bypass the wait policy.

Tune it after measuring the basic async recipe, especially if groups have
widely varying completion times.
