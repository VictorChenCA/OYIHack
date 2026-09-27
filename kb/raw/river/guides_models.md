# Models and access

## Available models

River provides optimized training and inference implementations for the following
open-weight models. Each implementation is tested for correctness; River handles
model placement and the distributed execution behind API calls.

- `deepseek-ai/DeepSeek-V4-Flash-0731`
- `nvidia/GLM-5.2-NVFP4`
- `nvidia/GLM-5.2-NVFP4-262K`
- `nvidia/Kimi-K2.6-NVFP4`
- `nvidia/Kimi-K2.6-NVFP4-262K`
- `nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4`
- `Qwen/Qwen3.5-9B`
- `Qwen/Qwen3.5-122B-A10B-FP8`
- `Qwen/Qwen3.5-397B-A17B-FP8`
- `Qwen/Qwen3.6-35B-A3B-FP8`
- `Qwen/Qwen3.8-27B-FP8`
- `zai-org/GLM-5.3-Flash`

Access is granted per account, so not every model above is enabled for every
API key.

### Check what your key can use

A minimal end-to-end check: connect, confirm the server is healthy, and print
the base models your key can use.

```python
import os
import river_client as river

client = river.Client(api_key=os.environ["RIVER_API_KEY"])

print("healthy:", client.health_check())
for name in client.get_capabilities():
    print(name)
```

Example output:

```text
healthy: True
Qwen/Qwen3.6-35B-A3B-FP8
Qwen/Qwen3.5-397B-A17B-FP8
nvidia/Kimi-K2.6-NVFP4
nvidia/GLM-5.2-NVFP4
```

`get_capabilities()` is the authoritative source: it returns the live list of
model names your key can pass as `base_model` in later calls. Always read it at
runtime rather than hard-coding — the catalog changes over time, and it is
scoped to your account, so it can return fewer models than the catalog above.

If you'd like access to more models, reach out on
[Discord](https://discord.gg/YjK48AuA8n) or email
[support@river.ai](mailto:support@river.ai).

## Cloud and on-premises

The River API is available in two deployment models:

| | River Cloud | On-premises |
| --- | --- | --- |
| GPU infrastructure | Hosted by River | Your existing GPU cluster |
| Training and inference | River manages the distributed execution | The same River stack runs on your infrastructure |
| Data and weights | Stored in River Cloud; trained weights can be downloaded | Training data, model weights, and inference run within your environment |
| Getting started | Create an API key in the Console | Work with River to deploy and configure your cluster |

The examples in this guide use River Cloud. On-premises deployments use the
same Python client with your cluster's endpoint and credentials. Available
models and capacity depend on the deployment. Contact [api@river.ai](mailto:api@river.ai)
to discuss an on-premises installation.

For an on-premises endpoint supplied by your administrator:

```python
client = river.Client(
    api_key=os.environ["RIVER_API_KEY"],
    endpoint="your-api-hostname",
)
```
