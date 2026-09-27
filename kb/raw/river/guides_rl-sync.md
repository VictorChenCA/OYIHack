# Your first RL training run

Train a model to solve math problems with `river_client.rl`. You supply questions
and a reward function; River generates answers, computes advantages, and updates
the model. This guide starts with synchronous training: finish a batch of
rollouts, take an optimizer step, then start the next batch.

For the intuition behind rewards and advantages, read
[Learning from rewards](/guides/rl-concepts/). Before a larger experiment, set
aside held-out tasks and measure the starting model. The
[evaluation guide](/guides/rl-checkpoints/#evaluate-a-saved-policy) adds this to
the recipe below.

## Training recipe

This example trains on GSM8K math problems for 20 batches. Each batch contains
8 questions with 8 independently sampled answers per question. It prints reward
and training metrics after each batch, then saves the trained weights.

The example uses `Qwen/Qwen3.5-9B` with an 8,192-token context.

Install the client and dataset loader, and set your [API key](/quickstart/#authentication):

```bash
pip install -U river-client datasets
export RIVER_API_KEY="rv_..."
```


## Define the task and reward

An environment turns a dataset row into an initial conversation and scores the
completed rollout. Here a row has a question and its numeric answer, taken from
the training split of GSM8K:

```python
from datasets import load_dataset

source = load_dataset("openai/gsm8k", "main", split="train").shuffle(seed=0)
rows = [
    {"question": row["question"], "answer": float(row["answer"].split("####")[-1].replace(",", ""))}
    for row in source.select(range(256))
]
```

The model sees the question. The answer stays in the reward function:

```python
import json

from river_client import rl
from river_client.renderers import get_text_content

class MathEnv(rl.Env):
    recovery = "stateless"

    async def reset(self, row):
        return [
            {
                "role": "system",
                "content": 'Solve the problem. Return your final answer as JSON: {"answer": 42}.',
            },
            {"role": "user", "content": row["question"]},
        ]

    async def reward(self, traj, row):
        # Read the final answer without the model's reasoning block.
        try:
            result = json.loads(get_text_content(traj.messages[-1]))
            return float(float(result["answer"]) == row["answer"])
        except (ValueError, TypeError, KeyError):
            return 0.0
```

The reward is 1 for a correct numeric answer in the requested JSON format and 0
otherwise. Missing or invalid answers earn 0. Replace this simple comparison
with the scoring rule for your task.

## Create the model and rollout engine

Create a LoRA model inside a River session. The renderer handles the chosen
model's chat format, including reasoning and tool tokens:

```python
from river_client.renderers import get_renderer

BASE_MODEL = "Qwen/Qwen3.5-9B"
renderer = get_renderer(BASE_MODEL)

model = session.create_model(
    base_model=BASE_MODEL,
    tokenizer=renderer.tokenizer,
    lora=river.LoraConfig(rank=16, seed=0),
)

engine = rl.RolloutEngine(
    model,
    env=MathEnv,
    renderer=renderer,
    budget=rl.Budget(
        max_turns=1,
        max_generated_tokens=4096,
        max_context_tokens=8192,
    ),
    schedule=rl.Schedule(concurrency=64),
    temperature=1.0,
    seed=0,
)
```

`max_turns=1` gives each rollout one assistant response, with up to 4,096
generated tokens. The 8,192-token context limit includes the prompt and answer
together. An unfinished answer that reaches either token limit receives a reward
of 0.

`concurrency` controls how many trajectories can run at once. The engine batches
their sampling requests while allowing each answer to complete independently.

## Train in groups

Use [GRPO-style](https://arxiv.org/abs/2402.03300) group-relative advantages with
`GroupCentered()`, which centers rewards within each question's rollout group.
This recipe uses the CISPO loss and leaves reward standardization disabled.

```python
trainer = rl.AsyncTrainer(
    engine=engine,
    optimizer=rl.Adam(lr=1e-5),
    advantage=rl.GroupCentered(),
    completion=rl.GroupCompletion(mode="wait"),
    normalize="token",
    loss="cispo",
    groups_per_step=8,  # Eight questions per training batch.
    group_size=8,      # Eight independently sampled answers per question.
    max_staleness=0,   # Finish this batch before advancing to the next policy.
)

rl.run(trainer, rows, steps=20, on_step=log_step)
```

`GroupCompletion` controls when a rollout group is ready for training. With
`mode="wait"`, all eight rollouts for a question finish before the group's
advantages are computed. Each rollout still respects its token and turn limits.

`AsyncTrainer` supports both synchronous and asynchronous RL. Here
`max_staleness=0` selects synchronous training; the class name does not imply
that old-policy rollouts are being used.

`normalize="token"` averages the loss across trainable generated tokens. The
engine records their original token IDs and log probabilities for training;
your reward function can work with readable messages.

### Synchronous training can still overlap work

Once a reward group finishes, its forward/backward computation can run while
other groups in the **same batch** are still sampling. All contributions use
the same policy, and one optimizer step runs after the batch is complete.

This happens automatically for eligible group-centered recipes. The trainer
coalesces ready groups before submitting work, so very small batches may not
show much overlap. [Asynchronous training](/guides/rl-async/) explains how this differs
from sampling ahead across optimizer updates.

## Read the results

The example prints the trainer's metrics as JSON. Start with:

| Metric | What it tells you |
| --- | --- |
| `reward/mean` | Fraction of correctly answered questions in the consumed batch. |
| `reward/zero_variance_group_frac` | Fraction of groups whose rewards offer no within-group learning signal. |
| `truncated/generated_tokens` | Fraction of rollouts that exhausted their total generation budget, when present. |
| `train/updated` | Whether this batch produced an optimizer update. |

Inspect a few `step.trajectories` alongside reward. If everything scores zero,
check answer parsing and token truncation before increasing the training budget.
If every answer within a group has the same reward, that group has no
group-relative signal. A whole batch with no usable gradient is reported but
does not update the model.

The script saves final inference weights and prints the checkpoint path. For
interruption recovery and a held-out measure of progress, add
[checkpoints and evaluation](/guides/rl-checkpoints/).

<details>
<summary>Full runnable script</summary>

```python
"""Train on GSM8K with River's RL library. See docs.river.ai/guides/rl-sync/."""

import json
import os
from contextlib import closing

import river_client as river
from datasets import load_dataset
from river_client import rl
from river_client.renderers import get_renderer, get_text_content

BASE_MODEL = "Qwen/Qwen3.5-9B"
STEPS = 20
MAX_STALENESS = 0
CONCURRENCY = 64


def load_rows():
    source = load_dataset("openai/gsm8k", "main", split="train").shuffle(seed=0)
    return [
        {"question": row["question"], "answer": float(row["answer"].split("####")[-1].replace(",", ""))}
        for row in source.select(range(256))
    ]


class MathEnv(rl.Env):
    recovery = "stateless"

    async def reset(self, row):
        return [
            {
                "role": "system",
                "content": 'Solve the problem. Return your final answer as JSON: {"answer": 42}.',
            },
            {"role": "user", "content": row["question"]},
        ]

    async def reward(self, traj, row):
        # Read the final answer without the model's reasoning block.
        try:
            result = json.loads(get_text_content(traj.messages[-1]))
            return float(float(result["answer"]) == row["answer"])
        except (ValueError, TypeError, KeyError):
            return 0.0


def log_step(step):
    print(
        json.dumps({"batch": step.n, "model_step": step.model_step, **step.metrics}),
        flush=True,
    )


def main():
    rows = load_rows()
    renderer = get_renderer(BASE_MODEL)
    with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
        with client.session(experiment="rl-math") as session:
            model = session.create_model(
                base_model=BASE_MODEL,
                tokenizer=renderer.tokenizer,
                lora=river.LoraConfig(rank=16, seed=0),
            )
            engine = rl.RolloutEngine(
                model,
                env=MathEnv,
                renderer=renderer,
                budget=rl.Budget(
                    max_turns=1,
                    max_generated_tokens=4096,
                    max_context_tokens=8192,
                ),
                schedule=rl.Schedule(concurrency=CONCURRENCY),
                temperature=1.0,
                seed=0,
            )
            trainer = rl.AsyncTrainer(
                engine=engine,
                optimizer=rl.Adam(lr=1e-5),
                advantage=rl.GroupCentered(),
                completion=rl.GroupCompletion(mode="wait"),
                normalize="token",
                loss="cispo",
                groups_per_step=8,
                group_size=8,
                max_staleness=MAX_STALENESS,
            )
            rl.run(trainer, rows, steps=STEPS, on_step=log_step)
            checkpoint = model.save_weights("math-final", mode="inference")
            print(json.dumps({"checkpoint": checkpoint.path}))


if __name__ == "__main__":
    main()
```

</details>
