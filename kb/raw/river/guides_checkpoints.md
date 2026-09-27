# Save and resume weights

## Saving and resuming (checkpoints)

`model.save_weights(name, mode=...)` writes the model's current weights to a
`river://` checkpoint and returns a `Checkpoint` (`.path`, `.step`,
`.checkpoint_type`). Two modes:

- `mode="training"` — includes optimizer state, so you can **resume training**
  later (and it can still be sampled from).
- `mode="inference"` — PEFT weights only; smaller, for serving / sampling.

**Resume:** the checkpoint `river://` path is all you need — it's durable, so you
can resume in a **completely separate session** (or process, or machine) by
passing the path to `session.create_model(checkpoint=...)`. For a training
checkpoint this restores the weights **and** optimizer state.

The example below runs **two independent sessions**: the first trains Model A on
one 100-token random sequence and saves a checkpoint; the second knows nothing
but the checkpoint path, and resumes from it. (We use random tokens purely to
watch the loss continue across the resume — there's nothing meaningful to
sample.)

```python
import os
import random
import river_client as river

client = river.Client(api_key=os.environ["RIVER_API_KEY"])
BASE = "Qwen/Qwen3.6-35B-A3B-FP8"

# One fixed 100-token random sequence for the model to memorize.
random.seed(0)
ids = [random.randint(1, 32000) for _ in range(100)]
data = [{"input_ids": ids, "target_tokens": ids[1:] + [ids[0]], "weights": [1.0] * 100}]

# ── Session 1: train and save a checkpoint ──
with client.session(project="ckpt-a") as session:
    a = session.create_model(base_model=BASE, lora=river.LoraConfig(rank=8))
    for _ in range(5):
        r = a.forward_backward(data, loss_fn="cross_entropy")
        a.optim_step(lr=1e-4)
        print(f"A step {a.step} loss={r.metrics['loss']:.1f}")
    ckpt = a.save_weights("ckpt_step5", mode="training")
    print("saved:", ckpt.path)

checkpoint_path = ckpt.path   # the only thing the next session needs

# ── Session 2 (separate): resume from just the checkpoint path ──
with client.session(project="ckpt-b") as session:
    b = session.create_model(
        base_model=BASE, lora=river.LoraConfig(rank=8), checkpoint=checkpoint_path,
    )
    rb = b.forward_backward(data, loss_fn="cross_entropy")
    b.optim_step(lr=1e-4)
    print(f"B first loss={rb.metrics['loss']:.1f}")
```

Output:

```text
A step 1 loss=1226.5
A step 2 loss=1207.4
A step 3 loss=1182.6
A step 4 loss=1156.9
A step 5 loss=1139.0
saved: river://2c1ca407-1a5a-4228-bdad-0a70840b7841/weights/ckpt_step5
B first loss=1117.1
```

Even though Model B is in a fresh session and only has the path, its first loss
(`1117.1`) continues right where Model A left off (`1139.0`) — rather than jumping
back near the starting loss. That's the checkpoint's weights and optimizer state
being restored. (The client-side `model.step` counter starts at `0` again, since a
bare path carries no step metadata; pass the `Checkpoint` object instead if you
want the step restored too.)

To **sample** from a saved checkpoint instead of resuming training, use
`session.sample(..., checkpoint=ckpt)` — shown in
[Supervised fine-tuning](/guides/sft/#supervised-fine-tuning-sft) step 4.
