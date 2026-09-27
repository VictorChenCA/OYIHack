# Checkpoints and evaluation

Save a run so it can recover after an interruption, and evaluate saved policies
on questions held out from training. Both work with synchronous and asynchronous
RL.

## Save recoverable training state

Add a checkpoint configuration to the trainer:

```python
checkpoint = rl.Checkpointing(
    "./runs/math",
    weights_every=5,
    on_signal=("SIGINT", "SIGTERM"),
)

# AsyncTrainer options:
# checkpoint=checkpoint,
# run_config={"task_version": 1},
```

River stores model-weight checkpoints remotely. The run directory stores the
trainer's progress, dataset position, pending rollout state, and a journal of
updates since the last full weight checkpoint. Recovery can replay those
intervening updates instead of requiring a full weight save after every batch.

Keep this directory on storage that survives your driver process or machine.
It also contains image bytes needed by recoverable trajectories, so preserve
the **whole directory** rather than only its metadata file.

`run_config` records recipe choices the library cannot infer, such as the
version of your reward function or environment. Increment that version when
their behavior changes and use a fresh run directory.

## Stop and resume

With the signal handlers above, Ctrl+C requests a checkpointed stop. Submitted
work may need to finish before shutdown. A trainer using the same checkpoint
directory recovers the saved state into fresh River sessions.

Keep the dataset order, batch sizes, total training horizon, and recipe the
same. If training was planned for 100 batches and stopped at batch 37,
resume with `steps=100`; the trainer recovers the completed work and continues
toward that total.

For a new experiment, use a new directory. `init_checkpoint` can initialize its
weights from a saved model checkpoint; that starts a new training plan rather
than resuming the previous plan's progress.

The small example exits on API or environment failure. Re-running it recovers
from durable state. A longer-running driver can recreate its sessions and
trainer after a transient failure using that same checkpoint directory.

## Restore environment state

The trainer can restore a conversation, but only your environment knows how to
restore a browser, simulator, or external service:

| `Env.recovery` | Use when |
| --- | --- |
| `"drop"` (default) | Unfinished environment state cannot be restored. Unfinished rollouts regenerate. |
| `"stateless"` | Continuing from the recorded conversation is sufficient and repeating interrupted work is safe. |
| `"snapshot"` | Your `snapshot` and `restore` methods can save and reconstruct the environment's private state. |

For example, the math environment from the
[synchronous training guide](/guides/rl-sync/#define-the-task-and-reward) is
stateless: the recorded conversation is enough to continue. A browser environment
usually needs a snapshot of its browser state or a fresh episode after restart;
the transcript alone cannot restore the page.

On recovery, saved image bytes are uploaded into the new session and handles
are remapped automatically. KV cache itself is not checkpointed; resumed
trajectories may need a prefill. Saved trajectories do not retain expert-routing
captures for replay after recovery; training uses its own routing for those
records.

## Evaluate a saved policy

Evaluation uses a separate session and a `CheckpointSampler`. That keeps each
evaluation on fixed weights even if training advances before it finishes.
Use that evaluation session in an engine factory for `Evaluator`:

```python
def evaluation_engine(checkpoint, variant):
    return rl.RolloutEngine(
        rl.CheckpointSampler(
            eval_session,
            base_model=BASE_MODEL,
            checkpoint=checkpoint,
            tokenizer=renderer.tokenizer,
        ),
        env=MathEnv,
        renderer=renderer,
        budget=budget,
        schedule=rl.Schedule(concurrency=8),
        temperature=0,  # Greedy evaluation; training uses positive temperature.
    )

evaluator = rl.Evaluator(
    holdout,
    engine_factory=evaluation_engine,
    every=5,
    group_size=1,
    final_group_size=1,
    sink=lambda result: print(result.step, result.metrics),
)
# Pass evaluator=evaluator to AsyncTrainer.
```

`every` counts training batches. `group_size=1` evaluates one answer per holdout
question; increase it when your evaluation calls for multiple samples.
The trainer excludes exact holdout rows from its training dataset. You still
control the split and must prevent semantically duplicated problems from
appearing on both sides.

Evaluation can run alongside training, and its session uses sampling capacity
too. Start with modest evaluation concurrency if it competes with training
rollouts. The trainer waits for scheduled evaluations before returning normally.

## Log training and evaluation

The RL library computes `step.metrics`; it does not automatically send them to
W&B. Supply a callback as in the math example, or connect your own logger:

```python
import wandb

run = wandb.init(project="math-rl")
run.define_metric("train/batch")
run.define_metric("train/*", step_metric="train/batch")

def log_step(step):
    run.log({
        "train/batch": step.n,
        **{f"train/{key}": value for key, value in step.metrics.items()},
    })

# Pass this as the Evaluator's sink:
eval_sink = rl.WandbSink(run, table_samples=8)
```

Use `sink=eval_sink` in `Evaluator`, and `on_step=log_step` in `rl.run`.
Finish the W&B run after training and evaluation complete. `WandbSink` records
evaluation against `eval/step`, so a late result appears at the batch it
measured. In this example, compare `eval/default/reward_mean` with
`train/reward/mean`.

If you resume a W&B experiment, persist and reuse its run ID in your driver;
the library's checkpoint directory does not choose a W&B run for you.

<details>
<summary>Full runnable script</summary>

This combines checkpoint recovery and evaluation with the environment and
dataset loader from the [math example](/guides/rl-sync/), imported as `rl_math`.

```python
"""Add checkpoint recovery and held-out evaluation to rl_math.py."""

import json
import os
from contextlib import closing

import river_client as river
from river_client import rl
from river_client.renderers import get_renderer
from rl_math import BASE_MODEL, MathEnv, load_rows, log_step


def main():
    rows = load_rows()
    holdout, train_rows = rows[:16], rows[16:]
    renderer = get_renderer(BASE_MODEL)
    budget = rl.Budget(
        max_turns=1,
        max_generated_tokens=4096,
        max_context_tokens=8192,
    )
    with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
        with (
            client.session(experiment="rl-math", role="train") as session,
            client.session(experiment="rl-math", role="eval") as eval_session,
        ):
            model = session.create_model(
                base_model=BASE_MODEL,
                tokenizer=renderer.tokenizer,
                lora=river.LoraConfig(rank=16, seed=0),
            )

            def evaluation_engine(checkpoint, variant):
                return rl.RolloutEngine(
                    rl.CheckpointSampler(
                        eval_session,
                        base_model=BASE_MODEL,
                        checkpoint=checkpoint,
                        tokenizer=renderer.tokenizer,
                    ),
                    env=MathEnv,
                    renderer=renderer,
                    budget=budget,
                    schedule=rl.Schedule(concurrency=8),
                    temperature=0,
                )

            evaluator = rl.Evaluator(
                holdout,
                engine_factory=evaluation_engine,
                every=5,
                group_size=1,
                final_group_size=1,
                sink=lambda result: print(
                    json.dumps({"eval_batch": result.step, **result.metrics}),
                    flush=True,
                ),
            )
            trainer = rl.AsyncTrainer(
                engine=rl.RolloutEngine(
                    model,
                    env=MathEnv,
                    renderer=renderer,
                    budget=budget,
                    schedule=rl.Schedule(concurrency=64),
                    seed=0,
                ),
                optimizer=rl.Adam(lr=1e-5),
                advantage=rl.GroupCentered(),
                completion=rl.GroupCompletion(mode="wait"),
                normalize="token",
                loss="cispo",
                groups_per_step=8,
                group_size=8,
                max_staleness=0,
                checkpoint=rl.Checkpointing(
                    "./runs/math",
                    weights_every=5,
                    on_signal=("SIGINT", "SIGTERM"),
                ),
                evaluator=evaluator,
                run_config={"task_version": 1},
            )
            rl.run(trainer, train_rows, steps=100, on_step=log_step)


if __name__ == "__main__":
    main()
```

</details>
