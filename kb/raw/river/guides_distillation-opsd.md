# Self-distillation with River OPSD

River implements `loss_fn="opsd"`. Its specific contract is **forward KL
from a hint-conditioned, same-weight teacher**, optionally combined with SFT.
The teacher forward has no gradients. It does not accept an external teacher
model, and it differs from the
[sampled reverse-KL self-distillation recipe](/guides/distillation-self/). Paper acronyms and
River loss names should not be treated as interchangeable.

## Prepare student and teacher contexts

Use a live River `student` and its tokenizer `tok`. These are two views of the
same model: one sees only the question, and one receives a checked solution.
This example is independent of the sampled reverse-KL helper.

```python
question = "A box has 24 pencils. Three students take 5 each. How many remain?"
solution = "The students take 3 × 5 = 15 pencils. The box has 24 − 15 = 9 left."

def prompt_ids(text):
    return tok.apply_chat_template(
        [{"role": "user", "content": text}],
        tokenize=True,
        add_generation_prompt=True,
    )

plain = prompt_ids(question)
informed = prompt_ids(
    f"{question}\n\nChecked solution:\n{solution}\n\n"
    "Solve the original problem in your own words."
)
```

## Align and train on a fresh response

The helper below pairs prediction positions across the two contexts. Sample
from the student without the solution, then run one native OPSD update:

```python
def self_distillation_datum(plain, informed, response):
    if not plain or not informed or not response:
        raise ValueError("Both prompts and the response must be nonempty")

    def stream(prompt):
        ids = prompt + response
        prefix_len = len(prompt) - 1
        return {
            "input_ids": ids,
            "target_tokens": ids[1:] + [0],
            "kl_mask": [0.0] * prefix_len + [1.0] * len(response) + [0.0],
            "kl_ids": [0] * prefix_len + list(range(len(response))) + [0],
        }

    datum = stream(plain)
    datum["loss_mask"] = [0.0] * len(datum["input_ids"])
    datum.update({f"teacher_{key}": value for key, value in stream(informed).items()})
    return datum

policy = student.get_policy_version()
if policy is None:
    raise RuntimeError("This example requires committed policy versions")
sample = student.sample(
    prompt_token_ids=plain, num_samples=1, max_tokens=512,
    temperature=1.0, top_p=1.0, top_k=-1,
)[0][0]
if not sample.token_data_is_exact:
    raise ValueError("Preserve exact response tokens")
if sample.policy_version is None or sample.policy_version.id != policy.id:
    raise ValueError("Sample from the current student policy")
student.forward_backward(
    [self_distillation_datum(plain, informed, sample.tokens)],
    loss_fn="opsd", ce_coef=0.0, kl_coef=1.0,
    zero_out=True, expected_policy_id=policy.id,
)
student.optim_step(lr=1e-5, grad_clip_norm=1.0, expected_policy_id=policy.id)
```

## Understand alignment and normalization

Active `kl_ids` pair prediction positions across streams even when the hint
makes one prompt longer. Both positions must predict the same response token.
The trailing slot is masked.

> [!WARNING]
>
> **OPSD normalizes differently from the RL losses.** This text-only loss
> averages each component over its active tokens within each row, then sums rows.
> For a batch mean, scale the final gradient by the number of rows once; do not
> divide by token count again.

`ce_coef=0` permits an all-zero SFT mask. If you add SFT, its `loss_mask`
must be disjoint from `kl_mask`.

See [Loss functions](/guides/losses/#native-self-distillation-with-opsd) for the complete field and coefficient contract.
