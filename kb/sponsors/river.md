# River AI: "your own frontier AI lab, in one API"

**What it is:** a Python client (`river-client`) for **SFT, RL (GRPO/ScaleRL), and distillation**
of open-weight models on River's GPUs, with LoRA adapters. You own and can download the weights.
Serving goes through OpenAI-compatible dedicated deployments. No local GPU needed.

- Docs: https://docs.river.ai (every page available as `.md`) · Console/API keys: https://console.river.ai
- **All docs mirrored locally:** `kb/raw/river/*.md`. Index: `kb/raw/river-llms.txt`.
  `python-api.md` (106KB) is the full reference.
- Support: Discord https://discord.gg/YjK48AuA8n · support@river.ai
- **Pricing:** token-based. Prompt $0.30–5.14/M, completion $0.80–12.84/M, training $1.00–15.41/M.
  **No free tier, so ask the sponsor for hackathon credits.**

## Quickstart
```bash
pip install river-client openai transformers
export RIVER_API_KEY="rv_..."
```
```python
import os, river_client as river
from contextlib import closing
with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
    print(client.health_check(), list(client.get_capabilities()))   # models YOUR key can use
    print(client.sample("Hi", base_model="Qwen/Qwen3.5-9B", max_tokens=256)[0].text)
```

## Train (SFT, LoRA). About 15 steps learns a toy pattern
```python
with client.session(project="hack") as session:
    model = session.create_model(base_model=BASE, lora=river.LoraConfig(rank=32))   # rank 1–32
    for _ in range(15):
        fb = model.forward_backward(batch, loss_fn="cross_entropy")   # or model.train_step(batch, loss_fn=..., lr=...)
        model.optim_step(lr=2e-4, grad_clip_norm=1.0)
    out = model.sample(prompt, max_tokens=64, temperature=0.0)        # list[list[Sample]] -> out[0][0].text
    ckpt = model.save_weights("v1", mode="inference")                 # river://RUN/sampler_weights/v1
    session.sample(prompt, base_model=BASE, checkpoint=ckpt, max_tokens=64)
```
Batch datum = `{"input_ids", "target_tokens" (ids shifted by 1), "weights" (0 on prompt, 1 on completion)}`.
Tokenize with HF `AutoTokenizer.from_pretrained(BASE)`. Full script: `kb/raw/river/guides_sft.md`.
RL: `guides_rl-sync.md` (sample, then score with YOUR reward fn, then update). Tools/multi-turn: `guides_rl-tools.md`.

## Models (check live with `get_capabilities()`; access is per key)
`Qwen/Qwen3.5-9B` (small/fast) · `Qwen/Qwen3.6-35B-A3B-FP8` (SFT guide) · `Qwen/Qwen3.8-27B-FP8` ·
`Qwen/Qwen3.5-122B-A10B-FP8` · `Qwen/Qwen3.5-397B-A17B-FP8` · `nvidia/Kimi-K2.6-NVFP4[-262K]` ·
`nvidia/GLM-5.2-NVFP4[-262K]` · `zai-org/GLM-5.3-Flash` · `deepseek-ai/DeepSeek-V4-Flash-0731` ·
`nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4`

## Serving
`client.create_deployment(checkpoint=..., unified_replicas=1, wait=True)` gives `deployment.base_url`
for use with the `openai` SDK (streaming, `/chat/completions`, stateless `/responses`).
**Needs a TEAM key with deployment access; personal keys can't deploy.** For a hack demo, skip
deployments: call `session.sample(..., checkpoint=ckpt)` behind your own tiny HTTP wrapper. Scale
to zero after the demo, because GPU-hours bill from create to delete.

## Gotchas
- Reasoning models can spend `max_tokens` on thinking. Give headroom.
- Sessions free their models on exit. Keep training and sampling inside the `with client.session()` block.
- Training cost and latency are real. Budget ONE small SFT/RL run and have a pre-baked checkpoint as a fallback.
