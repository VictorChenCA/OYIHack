# How the API works

River lets your Python program train and use an LLM running on River's GPUs.
You create a model instance, ask it to generate responses, and update it with
training data. Your code decides what to teach; River runs the model and
computes the updates. You do not need a local GPU.

The core distinction is simple: **sampling uses the current weights; training
changes them**. Sampling by itself does not teach the model anything.

<figure class="docs-learning-figure">
<div class="docs-flow">
<div><strong>Create a model</strong><small>Start your own trainable instance from an existing base model.</small></div>
<span aria-hidden="true">→</span>
<div class="docs-model"><strong>Train it</strong><small>Supply a batch and apply an update to its weights.</small></div>
<span aria-hidden="true">→</span>
<div><strong>Sample from it</strong><small>Generate a response using the updated weights.</small></div>
</div>
<figcaption>You can sample before the first update and between updates. Repeat the loop to train and evaluate the model.</figcaption>
</figure>

## Create a model instance

There are three objects to recognize:

| Object | What it means |
| --- | --- |
| `client` | Your authenticated connection to River. |
| `session` | The lifetime of your live models and their work. |
| `model` | A particular instance whose weights you can update and sample from. |

After the [quickstart](/quickstart/), you can create an instance like this:

```python
import os
from contextlib import closing

import river_client as river

with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
    with client.session() as session:
        model = session.create_model(
            base_model="Qwen/Qwen3.5-9B",
            lora=river.LoraConfig(rank=8),
        )
        samples = model.sample("What is 2 + 2?", max_tokens=256)
        print(samples[0][0].text)
```

`create_model` starts from an existing model's pretrained weights. It creates
your trainable instance; it does not train a new LLM from scratch. River uses
**LoRA adapters**, a small set of additional weights that your training updates.
The rank of 8 is a starting configuration; you can learn about
[adapter choices](/guides/lora/) later.

The Python `model` object is a handle to that remote instance. Keep subsequent
sampling and training calls inside the session. Exiting the `with` block
releases its live models.

## Sample to see what the model does

`model.sample(prompt, ...)` generates responses using that instance's current
weights. A sample includes the generated `.text`, along with token data for
training algorithms that need it.

The result is grouped by prompt and then by response. In the example,
`samples[0][0]` means the first response to the first prompt. `max_tokens` limits
how many tokens the model generates.

The quickstart uses `client.sample(..., base_model=...)` to generate from a
base model without creating a trainable instance. Once you are training, use
`model.sample(...)` to try **your instance's updated weights**. You do not need
to save or deploy it between training and sampling.

## Train with one call

Once you have a prepared training `batch`, one call applies an update:

```python
model.train_step(batch, loss_fn="cross_entropy", lr=1e-4)
```

Run this inside the same session as `model`. A **batch** is a list of training
examples. For SFT, those examples contain tokenized text and weights selecting
which response tokens to learn from. The [SFT walkthrough](/guides/sft/) shows
how to prepare one; you do not need to understand the token arrays yet.

`loss_fn` chooses the learning objective. Here, `cross_entropy` teaches the
model to imitate the examples. `lr` is the learning rate, which controls the
size of the update. Use the settings in the walkthrough for your first run.

`train_step` computes the training loss, calculates gradients—the direction
in which to adjust the trainable weights—and applies an optimizer update.
The call waits for the results. You can then call `model.sample(...)` again
to inspect the updated model. One update is one step in learning, not a
guarantee that the response will already improve.

SFT, reinforcement learning, and distillation use these same operations. What
changes is how you build the batch and choose the learning signal. In RL, your
program samples attempts and scores them before constructing the update; River
does not decide the task's reward for you.

## Optional: split the training step

Most introductory code can use `train_step`. When you need more control, its
two parts are available separately:

```python
model.forward_backward(batch, loss_fn="cross_entropy")
model.optim_step(lr=1e-4)
```

`forward_backward` computes the loss and gradients, but does not change the
weights. `optim_step` applies those gradients to change the weights. Separating
them lets you accumulate several batches or inspect results before updating.
The [custom RL chapter](/guides/rl-primitives/#accumulate-microbatches-then-update-once)
covers those controls and how failure handling differs from `train_step`.

## Keep the result and continue

Save the weights before leaving the session if you want to use them later:

```python
checkpoint = model.save_weights("my-first-model", mode="training")
print(checkpoint.path)
```

A checkpoint preserves the trained result beyond the live instance's lifetime.
Later chapters explain how to [resume it](/guides/checkpoints/) or
[deploy it](/guides/deployments/).

You now have the API's core loop: **create an instance, prepare a batch, train,
and sample**. Continue to [Learning from examples](/guides/sft-concepts/) to
understand the simplest learning signal, or use the
[first SFT run](/guides/sft/) to put the whole loop together.
