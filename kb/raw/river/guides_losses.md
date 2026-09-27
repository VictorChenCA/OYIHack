# Loss functions

## Loss functions

Pass the loss name as `loss_fn` to `forward_backward`, and any loss-specific
arguments as keyword arguments, e.g.
`model.forward_backward(data, loss_fn="cispo", eps_max=8.0)`.

> **The cross-entropy and RL losses below are summed over tokens** (not averaged).
> Each token's contribution
> is scaled by its per-token field — **`weights`** for `cross_entropy`,
> **`advantages`** for the RL losses. Setting a token's value to `0.0` removes it
> from the loss; larger magnitudes weight it more. (This is why masking the prompt
> with `0.0` restricts learning to the completion, and why the loss magnitude
> grows with the number of contributing tokens.)

| `loss_fn` | Use | Required per-datum fields | Arguments (default) |
| --- | --- | --- | --- |
| `cross_entropy` | Supervised fine-tuning | `input_ids`, `weights` (`target_tokens` optional) | — |
| `importance_sampling` | Off-policy policy gradient | `input_ids`, `old_logprobs`, `advantages` | — |
| `ppo` | Clipped policy optimization | `input_ids`, `old_logprobs`, `advantages` | `clip_low` (0.2), `clip_high` (0.2) |
| `cispo` | Clipped importance-sampling PO | `input_ids`, `old_logprobs`, `advantages` | `eps_max` (6.0) |
| `dro` | Direct reward optimization | `input_ids`, `old_logprobs`, `advantages` | `beta` (0.05) |
| `opsd` | Hint-conditioned self-distillation | Aligned student and teacher streams; see below | `ce_coef` (1.0), `kl_coef` (1.0) |

What each one is, at a high level:

- **`cross_entropy`** — standard supervised next-token loss. Trains the model to
  imitate the target tokens; `weights` choose which tokens count (e.g. `1.0` on
  the completion, `0.0` on the prompt). This is the SFT loss.
- **`importance_sampling`** — the basic off-policy policy gradient. Each token's
  update is scaled by its `advantage` and by the importance ratio between the
  current policy and the sampler that produced it (`old_logprobs`). Simplest RL
  loss; no clipping, so it can be noisy if the policy drifts far from the sampler.
- **`ppo`** — importance sampling with the ratio **clipped** to
  `[1 − clip_low, 1 + clip_high]`. The clip removes the incentive to move any
  single token's probability too far in one step, which keeps updates stable.
- **`cispo`** — clipped importance-sampling policy optimization. Instead of
  clipping the objective, it **caps the importance ratio at `eps_max`** while
  letting the gradient keep flowing through `log π`. Robust when samples are well
  off-policy (the approach used in ScaleRL-style training).
- **`dro`** — direct reward optimization. Adds a quadratic **anchor** (strength
  `beta`) pulling the policy toward the sampler's logprobs while it chases
  reward, trading a bit of reward for stability.

All four RL losses consume the same per-datum fields (`old_logprobs` +
`advantages`) and differ only in how they shape the update.

## Distillation objectives

For sampled reverse-KL feedback, use an RL loss with a detached per-token
advantage of `teacher_logprob - student_logprob`. `old_logprobs` still records
the student sampling policy. The
[distillation chapter](/guides/distillation/) explains the estimator and provides
examples for a larger teacher, a self-teacher, and multiple specialists.

`cross_entropy` also accepts two-dimensional `target_tokens` and `weights` per
datum, both shaped `[sequence_length, K]`. At each prediction position, supply
K candidate token IDs and their teacher probabilities as weights. This trains
against soft targets. Renormalizing over only the top-K tokens changes the
teacher distribution; it is an approximation, not full-vocabulary KL. The
returned per-position log probability is the weight-normalized mean over
candidates, not a vector of their individual log probabilities.

### Native self-distillation with opsd

`opsd` computes full-vocabulary **forward KL**, `KL(teacher || student)`, from a
hint-conditioned teacher using the same model weights. The teacher stream has
no gradient. It can also include supervised cross-entropy on separate student
positions. It accepts text-only data, not image chunks or an external teacher.

| Stream | Per-datum fields |
| --- | --- |
| Student | `input_ids`, `target_tokens`, `loss_mask`, `kl_mask`, `kl_ids` |
| Teacher | `teacher_input_ids`, `teacher_target_tokens`, `teacher_kl_mask`, `teacher_kl_ids` |
| Optional attention masks | `attention_mask`, `teacher_attention_mask` |

Each stream uses its own sequence length. Targets are next-token IDs aligned
with prediction positions. Binary `kl_mask` fields select paired positions;
the active `kl_ids` must be exactly `0..K-1` in each stream and pair identical
target tokens. All masks must be zero at the trailing no-target position.
Student `loss_mask` and `kl_mask` must be disjoint.

Unlike the token-summed losses above, `opsd` optimizes the **sum of per-row
means**: each row contributes `ce_coef × CE_sum / N_CE` plus
`kl_coef × KL_sum / N_KL`, with empty components contributing zero. A positive
`ce_coef` requires SFT tokens in every row. Set `ce_coef=0.0` for KL-only
training; every row must then contain KL tokens. Coefficients must be finite,
nonnegative, and at least one must be positive.

For a mean over B rows, apply `gradient_scale=1 / B` once at the optimizer step
on endpoints supporting `gradient_scale_v1`. Do not also divide by token count.
`opsd_objective_sum` reports the optimized scalar; `opsd_kl` and `ce_loss` report
aggregated token means for the components. See the
[aligned example](/guides/distillation-opsd/).

> **Custom loss functions aren't supported yet.** Use one of the built-in losses
> above; if you need a custom objective, reach out and we'll help.
