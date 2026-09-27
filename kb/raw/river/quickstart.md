# Your first River request

Connect to River and generate a response. This verifies your credentials and
model access before you start a training experiment.

You need Python, a River account, and an API key with access to a model. Requests
use your account's capacity and usage balance. A local GPU is not required for
River Cloud.

## Installation

Install the Python client in your Python environment:

```bash
pip install river-client
```

## Authentication

Create an API key on the **API Keys** page of the
[River Console](https://console.river.ai/), then set it in your terminal:

```bash
export RIVER_API_KEY="rv_..."
```

Pass the environment variable when constructing the client. The default endpoint
is River Cloud. For your own deployment, use the endpoint supplied by your
administrator; see [Models and access](/guides/models/).

## Generate a response

Use `Qwen/Qwen3.5-9B`, the small model used in our introductory RL recipe:

```bash
export RIVER_MODEL="Qwen/Qwen3.5-9B"
```

Save this as `first_request.py`:

```python
import os
from contextlib import closing

import river_client as river

with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
    samples = client.sample(
        "Explain supervised fine-tuning in one sentence.",
        base_model=os.environ["RIVER_MODEL"],
        max_tokens=256,
    )
    print(samples[0].text)
```

Run `python first_request.py`. The call waits for sampling to finish and
prints the response. Its wording will vary. Reasoning models may spend part of
the token budget on reasoning and reach the limit before giving a final answer.

This request samples an existing model; it does not train one. You do not need
to manage request IDs or polling for this example.

## Start a training run

Read [How the API works](/guides/api-basics/) for a short introduction to model
instances, sampling, and training updates. Then choose your first recipe.

Choose the signal you can supply:

- **Example answers:** follow [Your first SFT run](/guides/sft/). Read
  [Learning from examples](/guides/sft-concepts/) for the meaning of loss and masking.
- **A reward function:** follow [Your first RL run](/guides/rl-sync/). Read
  [Learning from rewards](/guides/rl-concepts/) for the loop behind the recipe.

Each recipe lists its own dependencies, model, and training settings. Verify
that the recipe's model is available to your key before running it.

## If the request fails

| What you see | What to check |
| --- | --- |
| Missing `RIVER_API_KEY` or `RIVER_MODEL` | Export the variable in the same terminal that runs Python. |
| Authentication failure | Confirm the key is valid and belongs to the intended account or team. |
| Model access failure | Use the [access check below](#check-your-model-access) to find an available model, then update `RIVER_MODEL`. |
| A request waiting for a result | Check run status and account capacity in the Console; see [Sessions and requests](/guides/requests/). |
| An incomplete response | Inspect the generated text and token budget; reasoning may use the available tokens. |

## Check your model access

If the example model is not enabled for your key, run this script to list the
models available to your account:

```python
import os
from contextlib import closing

import river_client as river

with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
    print("healthy:", client.health_check())
    print("available models:")
    for name in client.get_capabilities():
        print(name)
```

You should see `healthy: True` and the names your key can use. The list is specific
to your account. Choose a name from the list and use it for `RIVER_MODEL`. If the list is empty,
see [Models and access](/guides/models/) for help getting access.
