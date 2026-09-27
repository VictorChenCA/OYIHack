# Deploy and serve

## Dedicated streaming deployments

Use a dedicated deployment to serve your trained model to applications and
agents. River reserves serving capacity for a saved checkpoint and exposes an
OpenAI-compatible endpoint, including streaming responses. Training sessions
and production deployments have separate lifecycles: ending a training session
does not stop a deployment. Use a team API key with
deployment access for the checkpoint's base model; contact River to enable
access. Personal API keys cannot create deployments.

```bash
pip install river-client openai
```

Save the trained model with `model.save_weights("serving-v1", mode="inference")`,
then use the returned checkpoint path:

```python
import os

import river_client as river
from openai import OpenAI

api_key = os.environ["RIVER_API_KEY"]
client = river.Client(api_key=api_key, endpoint="api.river.ai")
deployment = client.create_deployment(
    checkpoint="river://YOUR_RUN_ID/sampler_weights/serving-v1",
    unified_replicas=1,
    idempotency_key="serving-v1",
    wait=True,
)
print("Deployment:", deployment.id, deployment.base_url)

with OpenAI(api_key=api_key, base_url=deployment.base_url) as inference:
    with inference.chat.completions.create(
        model=deployment.model,
        messages=[{"role": "user", "content": "Hello"}],
        stream=True,
    ) as stream:
        for chunk in stream:
            if chunk.choices:
                print(chunk.choices[0].delta.content or "", end="", flush=True)
```

The URL selects the checkpoint. It already includes the OpenAI API prefix;
pass it unchanged as `base_url`. Creation is asynchronous: `wait=True` waits
for serving capacity. To require every requested replica to be ready, call
`client.wait_for_deployment(deployment.id, until=("ready",))`.
Reuse an idempotency key when retrying the same creation request; use a new key
for a new deployment.

Capacity is specified in replicas. River selects the GPU shape for the model;
one replica does not necessarily mean one GPU. Choose either
`unified_replicas` or both `prefill_replicas` and `decode_replicas` at creation.
The topology cannot be changed afterwards.

### Scale, stop, and delete

```python
client.list_deployments()
client.scale_on_target(deployment.id, unified_replicas=2)
client.get_deployment_usage(deployment.id)

# Release serving capacity while keeping the URL and checkpoint.
client.scale_on_target(deployment.id, unified_replicas=0)
client.wait_for_deployment(deployment.id, until=("scaled_to_zero",))

# Resume on the same URL.
client.scale_on_target(deployment.id, unified_replicas=1)
client.wait_for_deployment(deployment.id)

# Release the deployment when it is no longer needed.
client.delete_deployment(deployment.id, wait=True)
```

Scaling sets absolute targets, not increments. For a prefill/decode deployment,
scale both roles to zero together and both back up to resume. Scale-down and
deletion drain active work before releasing resources. Requested GPU-hours
start at create/scale acceptance and stop at scale-to-zero/delete acceptance;
they include provisioning and outage time. Usage records report observed
allocation separately.

Use a fresh checkpoint name and a new deployment to update weights while the
old deployment continues serving. Saving new weights at an existing checkpoint
path does not reload running workers. To update at the same URL, scale to zero,
wait for draining to finish, save the new weights, then restore capacity.

Deployments also support stateless `/responses` requests: set `store=False`
and send conversation history on each request. Stored responses,
`previous_response_id`, and background processing are unsupported. If a stream
fails after it starts, the application must decide whether to start a new
request; an interrupted stream cannot be resumed.

See the [Python API reference](/python-api/#clientcreate_deployment) for the
deployment methods and parameters.
