# Choosing an adapter

A LoRA adapter learns an adjustment to a fixed base model. You choose its
capacity and which weight groups it can change. You can use the same adapter
mechanism for SFT and RL; the learning signal determines what it learns.

The [LoRA paper](https://arxiv.org/abs/2106.09685) describes the low-rank
parameterization. For using River, the practical distinction is that your saved
adapter needs the corresponding base model to produce responses.

## LoRA configuration

`session.create_model(..., lora=river.LoraConfig(...))` controls the LoRA adapter
that gets trained:

```python
river.LoraConfig(
    rank=16,             # adapter capacity; the default supported range is 1–32
    train_attn=True,     # adapt the attention projections
    train_mlp=True,      # adapt the MLP / expert projections
    train_unembed=False, # also adapt the output (unembedding) layer
    seed=None,           # optional seed for reproducible LoRA init
)
```

- **`rank`** — the adapter's capacity. The default supported range is 1–32;
  the server enforces the limit configured for the selected model.
- **`train_attn` / `train_mlp`** — which weight groups receive LoRA adapters
  (attention vs. MLP/expert layers). Both default on.
- **`train_unembed`** — also adapt the output/unembedding layer. Off by default;
  RL runs often turn it on.

## Choose capacity by evaluation

Start with the rank in a working recipe. Increasing rank gives the adapter more
trainable capacity; it does not guarantee better generalization. Compare ranks
with the same dataset split and evaluation protocol before adding complexity.

Keep the target weight groups fixed while testing another setting. Changing
rank, learning rate, training data, and target groups together makes the cause
of any improvement hard to identify. Record the configuration with the run.

For a first experiment, use the settings in [Your first SFT run](/guides/sft/)
or [Your first RL run](/guides/rl-sync/). Save a
[checkpoint](/guides/checkpoints/) to retain the learned adapter.
