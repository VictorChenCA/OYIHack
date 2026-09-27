# Your first SFT run

Train a small, inspectable task from input–output examples, then generate with
the trained model and save its weights. Read [Learning from examples](/guides/sft-concepts/)
for the meaning of the loss and token masks.

Before running, complete [authentication](/quickstart/#authentication), confirm
access to `Qwen/Qwen3.6-35B-A3B-FP8`, and install the dependencies:

```bash
pip install river-client transformers
```

## Supervised fine-tuning (SFT)

This example verifies a complete training loop with a small, inspectable task: **prefix `test-` to every word** of the
input (e.g. `"hello world"` → `"test-hello test-world"`). The model can learn this pattern
from a small dataset in about 15 steps. In your application, replace these pairs
with examples of the behavior you want the model to learn.

### 1. Build a tiny dataset

Each example is a `(prompt, completion)` pair. We tokenize both and concatenate
them into one `input_ids` sequence. Per-token `weights` mask the prompt with
`0.0` so the loss is taken **only on the completion**, and `target_tokens` is the
next-token target at each position (position `i` predicts `ids[i+1]`, so the mask
is offset by one).

```python
import os
import river_client as river
from transformers import AutoTokenizer

client = river.Client(api_key=os.environ["RIVER_API_KEY"])
BASE = "Qwen/Qwen3.6-35B-A3B-FP8"
tok = AutoTokenizer.from_pretrained(BASE)
EOS = tok.eos_token_id

def target_for(x):
    return " ".join("test-" + w for w in x.split())

train_inputs = [
    "hello world",
    "good morning sunshine",
    "the quick brown fox",
    "i love programming",
    "open the pod bay doors",
    "river flows to the sea",
]

def render(x):
    return f"Input: {x}\nOutput:"

def make_datum(x):
    prompt_ids = tok(render(x), add_special_tokens=False)["input_ids"]
    completion_ids = tok(" " + target_for(x), add_special_tokens=False)["input_ids"] + [EOS]
    ids = prompt_ids + completion_ids
    target_tokens = ids[1:] + [EOS]
    weights = [0.0] * (len(prompt_ids) - 1) + [1.0] * (len(completion_ids) + 1)
    return {"input_ids": ids, "target_tokens": target_tokens, "weights": weights}

batch = [make_datum(x) for x in train_inputs]
```

### 2. Create a session and train

`client.session()` opens a training session (a context manager that frees the
model on exit). `session.create_model(...)` creates a LoRA model to train, sized
by `river.LoraConfig(rank=...)` (the default supported rank range is 1–32). Each step:
`forward_backward(data, loss_fn="cross_entropy")` runs the forward pass and
accumulates gradients (returns `.metrics["loss"]`), and `optim_step(lr=...)`
applies an **AdamW** update and advances `model.step`.

```python
with client.session(project="sft-prefix") as session:
    model = session.create_model(base_model=BASE, lora=river.LoraConfig(rank=32))
    print("model_id:", model.model_id)

    for step in range(15):
        fb = model.forward_backward(batch, loss_fn="cross_entropy")
        model.optim_step(lr=2e-4, grad_clip_norm=1.0)
        print(f"step {model.step:2d}  loss={fb.metrics['loss']:.4f}")
```

The loss collapses within a handful of steps:

```text
model_id: ba1c7208-3c2a-442d-98f2-8aea7bb6980e:model:1
step  1  loss=34.4821
step  2  loss=19.3106
step  3  loss=9.1079
step  4  loss=3.2211
step  5  loss=0.1230
step  6  loss=0.0441
step  7  loss=0.0037
step  8  loss=0.0001
...
step 15  loss=0.0000
```

### 3. Sample from the trained model

`model.sample(prompt, ...)` generates from the model's **current in-memory
weights** (no checkpoint needed) and returns `list[list[Sample]]` (per-prompt ×
per-sample). We sample greedily (`temperature=0.0`), still inside the session:

```python
    for x in ["hello world", "the lazy dog sleeps"]:
        out = model.sample(render(x), max_tokens=16, temperature=0.0, stop=["\n"])
        print(f"{x!r} -> {out[0][0].text!r}")
```

It learned the rule, and even generalizes to the unseen `"the lazy dog sleeps"`:

```text
'hello world' -> ' test-hello test-world'
'the lazy dog sleeps' -> ' test-the test-lazy test-dog test-sleeps'
```

### 4. Save a checkpoint and sample from it

`model.save_weights(name, mode="inference")` saves the LoRA as a checkpoint, and
`session.sample(..., checkpoint=ckpt)` samples from a saved checkpoint — it loads
the LoRA, generates, then unloads (no live model needed):

```python
    ckpt = model.save_weights("prefix", mode="inference")
    print("saved:", ckpt.path)

    for x in ["hello world", "the lazy dog sleeps"]:
        out = session.sample(render(x), base_model=BASE, checkpoint=ckpt,
                             max_tokens=16, temperature=0.0, stop=["\n"])
        print(f"{x!r} -> {out[0][0].text!r}")
```

The checkpoint reproduces the same behavior:

```text
saved: river://6501216f-c72d-4186-a37c-b65bee62bf58/sampler_weights/prefix
'hello world' -> ' test-hello test-world'
'the lazy dog sleeps' -> ' test-the test-lazy test-dog test-sleeps'
```

Install the dependencies and run the whole thing:

```bash
pip install river-client transformers
export RIVER_API_KEY="rv_..."
python sft.py
```

<details>
<summary>Full runnable script (sft.py)</summary>

```python
import os
import river_client as river
from transformers import AutoTokenizer

client = river.Client(api_key=os.environ["RIVER_API_KEY"])
BASE = "Qwen/Qwen3.6-35B-A3B-FP8"
tok = AutoTokenizer.from_pretrained(BASE)
EOS = tok.eos_token_id

def target_for(x):
    return " ".join("test-" + w for w in x.split())

train_inputs = [
    "hello world",
    "good morning sunshine",
    "the quick brown fox",
    "i love programming",
    "open the pod bay doors",
    "river flows to the sea",
]

def render(x):
    return f"Input: {x}\nOutput:"

def make_datum(x):
    prompt_ids = tok(render(x), add_special_tokens=False)["input_ids"]
    completion_ids = tok(" " + target_for(x), add_special_tokens=False)["input_ids"] + [EOS]
    ids = prompt_ids + completion_ids
    target_tokens = ids[1:] + [EOS]
    weights = [0.0] * (len(prompt_ids) - 1) + [1.0] * (len(completion_ids) + 1)
    return {"input_ids": ids, "target_tokens": target_tokens, "weights": weights}

batch = [make_datum(x) for x in train_inputs]

with client.session(project="sft-prefix") as session:
    model = session.create_model(base_model=BASE, lora=river.LoraConfig(rank=32))
    print("model_id:", model.model_id)

    # Train
    for step in range(15):
        fb = model.forward_backward(batch, loss_fn="cross_entropy")
        model.optim_step(lr=2e-4, grad_clip_norm=1.0)
        print(f"step {model.step:2d}  loss={fb.metrics['loss']:.4f}")

    # Sample from the live trained weights
    for x in ["hello world", "the lazy dog sleeps"]:
        out = model.sample(render(x), max_tokens=16, temperature=0.0, stop=["\n"])
        print(f"{x!r} -> {out[0][0].text!r}")

    # Save an inference checkpoint and sample from it
    ckpt = model.save_weights("prefix", mode="inference")
    print("saved:", ckpt.path)
    for x in ["hello world", "the lazy dog sleeps"]:
        out = session.sample(render(x), base_model=BASE, checkpoint=ckpt,
                             max_tokens=16, temperature=0.0, stop=["\n"])
        print(f"{x!r} -> {out[0][0].text!r}")
```

</details>

## Evaluate beyond the demonstration

This tiny dataset is useful for checking that the training loop works. Its
training loss and a few sample outputs are not a broad evaluation of the model.
Keep a separate set of inputs, compare the starting and trained models under
the same generation settings, and inspect failures. The
[SFT chapter](/guides/sft-concepts/#decide-whether-training-helped) explains how
to interpret those results.
