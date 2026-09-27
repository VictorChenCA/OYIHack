# Sessions and requests

A session owns the live models used for sampling and training. Use a context
manager so the client releases the model when the session ends. Save weights
before exiting if you need to keep the trained result.

## The objects you work with

| Object | Purpose |
| --- | --- |
| `Client` | Connect to River with your credentials. |
| Session | Scope the live training and sampling work. |
| Model | Hold the trainable adapter and submit model operations. |
| Checkpoint | Save weights for later use beyond the session lifetime. |
| Deployment | Reserve serving capacity for a saved checkpoint. |

Training sessions and production deployments have separate lifecycles. Ending
a session does not stop an existing deployment. See
[Deploy and serve](/guides/deployments/) for releasing serving capacity.

## How requests work: submit, then poll

Training and queued sampling use an asynchronous request API: submit work,
receive a `request_id`, and retrieve the result when it is ready. The Python
client can handle that polling for you.

This section covers the training API. [Dedicated deployments](/guides/deployments/#dedicated-streaming-deployments)
serve interactive production traffic through an OpenAI-compatible HTTP endpoint.

### The high-level way (recommended)

The high-level methods do this for you. `client.sample(...)` **blocks** until the
result is ready and returns it directly — no ids, no polling:

```python
import os
import river_client as river

client = river.Client(api_key=os.environ["RIVER_API_KEY"])
BASE = "Qwen/Qwen3.6-35B-A3B-FP8"

samples = client.sample("What is 2 + 2? Answer briefly.", base_model=BASE, max_tokens=24)
print(repr(samples[0].text))
```

Expected output (the Qwen models are reasoning models, so the text includes a
`<think>…</think>` block):

```text
'\n\n<think>\n\n</think>\n\n4'
```

### The low-level way (submit + poll)

Under the hood that's two steps. The `submit_*` methods expose them: submit
returns immediately with a `request_id`, and `.result()` polls until the result
is ready.

```python
with client.session() as session:
    # 1. Submit — returns immediately with a request_id.
    pending = session.submit_sample("What is 2 + 2? Answer briefly.", base_model=BASE, max_tokens=24)
    print("request_id:", pending.request_id)

    # 2. Poll — .result() returns groups indexed by prompt, then sample.
    groups = pending.result()
    print(repr(groups[0][0].text))
```

Expected output:

```text
request_id: d8461f9d-8269-4410-bce1-39bfeee97abc
'\n\n<think>\n\n</think>\n\n4'
```

Each request gets its own `request_id` (a UUID) — yours will differ. Submitting
several requests before polling lets independent work run in parallel. See
[Throughput and the Console](/guides/operations/) for measurement guidance.
