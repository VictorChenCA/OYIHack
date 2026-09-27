# Sentinel: C&C's System One model, trained on River

Blocker text in (a Claude Code hook payload + the agent's last message), **5 typed, calibrated decisions** out:
`kind`, `quadrant`, `human_only`, `department`, `tier`. Each label is a one-token code; all items × fields go out in
**one batched River sample call** (`max_tokens=1`, `temperature=0`, `logprobs=20`); the top-K logprobs are filtered to
the allowed codes, temperature-scaled per field and renormalized, so an invalid label is impossible by construction.

Base: `Qwen/Qwen3.5-9B`, LoRA rank 16, SFT on River. Results: `eval.md`, `card.json`, `STATUS.md`.

## Run the sidecar locally (`.venv-river`)
From the repo root:
```bash
set -a; . ./.env; set +a                                     # RIVER_API_KEY
.venv-river/bin/python app/river/sidecar.py                  # trained LoRA (best checkpoint in checkpoint.json), 127.0.0.1:7788
.venv-river/bin/python app/river/sidecar.py --base           # untrained base (A/B)
.venv-river/bin/python app/river/sidecar.py --checkpoint river://.../sampler_weights/...
```
Warm-up (first LoRA load) takes ~25 s; the server prints `{"listening": ...}` when ready.

```bash
curl -s 127.0.0.1:7788/health
curl -s -X POST 127.0.0.1:7788/classify -d '{"items":[{"id":"e1","text":"StopFailure error=authentication_failed | msg=\"JIRA_API_TOKEN is missing\""}]}'
curl -s -X POST '127.0.0.1:7788/classify?engine=base' -d '{"items":[...]}'      # base model, same prompt (live A/B)
curl -s -X POST '127.0.0.1:7788/classify?engine=fast' -d '{"items":[...]}'      # speed-gate fallback, ~1 ms
curl -s -X POST '127.0.0.1:7788/classify?engine=auto&budget_ms=1500' -d '{"items":[...]}'  # River if under budget, else fast
curl -s -X POST 127.0.0.1:7788/reload -d '{"checkpoint":"river://..."}'         # hot-swap the active LoRA
curl -s 127.0.0.1:7788/models                                                  # known checkpoints + eval summaries
```
Response: `{"results":[{"id","fields":{"kind":{"label","p","dist":{...}},...},"latency_ms"}],"model","checkpoint","engine"}`.

**Speed gate:** River's live p50 for 10 blockers × 5 fields is ~4.0 s for the trained LoRA (2.5 s base; one blocker costs the
same as ten), over the 1.5 s gate and over `classify.ts`'s 3 s timeout. So the server's hot path should call
`?engine=auto&budget_ms=1500` (River if it answers in time, else the fast classifier) or `?engine=fast`. The River model stays the evaluated model,
the Research Center model and the base/trained A/B.

## No sidecar needed for the fast path: `fast_clf.ts`
The fast fallback also runs in TypeScript from the same `fast_clf.json` (identical labels and probabilities to the
Python model on all 265 test rows; ~0.1 ms per blocker). Import it in the Bun server or the browser, so a hosted
build classifies instantly with no Python, no River key and no laptop:
```ts
import { classifyFast, classifyFastBatch } from "../river/fast_clf";
classifyFast(text).kind            // {label, p, dist}
classifyFastBatch(items)            // same shape as the sidecar's POST /classify
```

## Research Center scripts
```bash
# retrain with human corrections (rows {"text","fields":{...}}; partial fields OK); one JSON line per step on stdout
.venv-river/bin/python app/river/train.py --data app/river/data/train.jsonl,app/data/corrections.jsonl \
    --base Qwen/Qwen3.5-9B --steps 60 --out app/river/runs/r1
#   -> {"step","loss","elapsed_s","checkpoint"?,"val_acc"?} ... then runs/r1/checkpoint.json (best on val)
.venv-river/bin/python app/river/eval.py --checkpoint river://... --data app/river/data/test_unseen.jsonl \
    --out app/river/runs/r1/eval.json --compare-base --md app/river/runs/r1/eval.md
curl -s -X POST 127.0.0.1:7788/reload -d '{"checkpoint":"river://..."}'           # promote
```
`train.py --init <river://.../weights/...-train>` continues from a training checkpoint.

## Files
| File | What |
|---|---|
| `policy.md` | C&C's triage policy (the teacher's labeling rules; the model never sees it) |
| `gen_data.py`, `data/*.jsonl` | teacher dataset: train 880 / val 120 / test_unseen 260 (held-out vendors, tasks, phrasings, format) |
| `sentinel.py` | prompts, one-token codes, logprobs → calibrated distribution |
| `train.py`, `steps.jsonl`, `checkpoint.json` | LoRA SFT on River, per-step loss, `river://` checkpoints |
| `eval.py`, `eval.json`, `eval.md`, `calibration.json` | base vs trained on test_unseen; per-field temperatures |
| `sidecar.py` | local HTTP classifier (stdlib + river-client) |
| `fast_clf.py`, `fast_clf.json` | numpy TF-IDF + logistic regression fallback for the hot path (not a River model) |
| `bench.py` | base-model latency benchmark |
| `card.json`, `make_card.py` | the Sentinel's UI card data |
