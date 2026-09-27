# Throughput and the Console

## Throughput and batch size

Training and inference run on an **autoscaling worker pool** — River scales
capacity up and down automatically to match your load. Because there's fixed
per-step overhead, **bigger batches generally give higher throughput**: packing
more prompts/sequences into a single `forward_backward` or `sample` call
amortizes that overhead.

Increase batch size gradually and measure tokens per second alongside training
quality. The useful limit depends on the model, sequence lengths, and capacity
available to your account or cluster. Dedicated production deployments use the
replica targets you configure; scale those explicitly as serving demand changes.

## River Console

The [River Console](https://console.river.ai/) gives your team a shared view of
training runs, checkpoints, deployments, usage, and spend. Use it alongside the
Python client to check run status, inspect saved checkpoints, and manage API keys.

To download trained weights, open **Checkpoints**, select an inference checkpoint,
and use its download action. An inference checkpoint contains the LoRA adapter
weights in PEFT format; use them with the corresponding base model. A
`river://` checkpoint path identifies a checkpoint inside River and is not a
public download URL.
