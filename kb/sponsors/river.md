# River AI: "your own frontier AI lab, in one API"

**Side quest prize:** "Best use of a custom model/agent (trained using River API)." (The demo has to use a model you trained with River.) **Prize: 50k / 25k / 15k River API credits.** All tracks are in `kb/EVENT.md#prizes`.

**What it is:** a Python client (`river-client`) for **SFT, RL (GRPO/ScaleRL), and distillation**
of open-weight models on River's GPUs, with LoRA adapters. You own and can download the weights.
Serving goes through OpenAI-compatible dedicated deployments. No local GPU needed.

- Docs: https://docs.river.ai (every page available as `.md`) · Console/API keys: https://console.river.ai
- **All docs mirrored locally:** `kb/raw/river/*.md`. Index: `kb/raw/river-llms.txt`.
  `python-api.md` (106KB) is the full reference.
- Support: Discord https://discord.gg/YjK48AuA8n · support@river.ai
- **Pricing:** token-based. Prompt $0.30–5.14/M, completion $0.80–12.84/M, training $1.00–15.41/M.
  No free tier, but **free hackathon credits are at the River AI booth. Unused credits expire at the end of the day.**

## Hackathon brief (river.ai/own-your-intelligence-hackathon, mirrored at `kb/raw/river/hackathon/page.md`)
"**The best showcase of using a custom model wins.**" River judges on three things, so build the demo around them:
1. **Demo the experience:** what it is and who it's for.
2. **Explain what the model learned:** show the training examples or the reward signal.
3. **Show why it helps:** **compare base vs. trained on unseen tasks** (a held-out eval or side-by-side).

**Kickoff case study ("Personal AI"):** a LoRA trained on your own messages with River SFT, so replies
sound like you. Its UI: a text box, a Rewrite button, think/temp 0.7/max tok 512. Prompt
`[given text]: Hello, should I try SFT or RL training?\n[rewritten text]:` came back from the trained
adapter as `yo should i try sft or rl training`.

**Official example `style_chat.py`** (`kb/raw/river/hackathon/`; tests need no key):
`uv run --no-project style_chat.py`. It's a chat on base `Qwen/Qwen3.8-27B-FP8` that trains online. The base
model rewrites each of your messages into neutral prose, and the pair (neutral → your original) is an SFT
example. Every 8 messages it runs 1 `train_step` (LoRA rank 16, lr 1e-4), then hot-loads the new adapter,
which rewrites the assistant's replies into your style. It saves `messages/pairs/steps.jsonl` under
`style-chat-runs/<id>`, and `--resume` continues a run. It pins `river-client==0.10.0` via uv inline
deps; `.venv-river` has 0.12.0.
API calls it uses (a known-good pattern to copy):
```python
client.chat_complete(messages, base_model=M, max_tokens=..., temperature=0,
                     chat_template_kwargs={"enable_thinking": False})   # base model, no session
model = session.create_model(base_model=M, lora=river.LoraConfig(rank=16))
model.load_weights(ckpt, load_optimizer=True)                          # resume a training checkpoint
from river_client.renderers import get_renderer, TrainOnWhat
ex = get_renderer(M, thinking=False).build_training_example(msgs + [{"role": "assistant", "content": target}],
                                                          train_on=..., train_on_eos=True, max_length=None)
fb, opt = model.train_step([ex.to_dict()], lr=1e-4, loss_fn="cross_entropy")   # don't auto-retry
model.save_weights(name + "-train", mode="training", ttl=timedelta(days=30))   # resumable
inf = model.save_weights(name + "-inf", mode="inference")                     # inf.path = river://...
model.chat_complete(msgs, max_tokens=..., temperature=0.3,
                    chat_template_kwargs={"enable_thinking": False})         # sample the LoRA
```
`result.response_json` is an OpenAI-style chat completion (`choices[0].message.content`).
`get_renderer(...).build_training_example` saves hand-building `input_ids/target_tokens/weights`.

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
