# Cloud task: train "Sentinel", C&C's System One classifier, on River

You're working on **C&C (Command and Control)**, an RTS-style command center for AI agent swarms. It's being built solo at
YC's *Own Your Intelligence* hackathon (Sun Sep 27 2026, San Francisco). **Hard deadline: 17:00 PT.** Your job is the
River side quest: train and evaluate a custom model with the River API, and ship a local inference sidecar.
Work only inside `app/river/`. Another session builds the rest of the app in parallel.

## Read first (in this repo)
1. `app/SPEC.md`: the product spec. Read **§6 Enemies** (what gets classified) and **§8 River: the Sentinel** (your
   spec). Skim §2, §3.3 and §10 for context.
2. `kb/EVENT.md`: the **Prizes** table (River's criterion: "best use of a custom model/agent trained using River API").
3. `kb/sponsors/river.md`: River's judging criteria (**demo the experience; explain what the model learned; show base vs
   trained on unseen tasks**), plus a known-good API pattern copied from River's official example.
4. River docs, mirrored in `kb/raw/river/`:
   - basics: `quickstart.md`, `guides_api-basics.md`, `guides_models.md`, `guides_requests.md`;
   - SFT: `guides_sft.md`, `guides_sft-concepts.md`, `guides_lora.md`, `guides_losses.md`;
   - `guides_checkpoints.md`, `guides_distillation-basics.md`;
   - for the calibration stretch: `guides_rl-concepts.md`, `guides_rl-sync.md`;
   - **`python-api.md`** is the full client reference: `Client.sample(..., logprobs=K, max_tokens=1)`, `session.create_model`,
     `LoraConfig`, `train_step`, `save_weights`, `load_weights`, `chat_complete`.
5. `kb/raw/river/hackathon/page.md` and **`kb/raw/river/hackathon/style_chat.py`**, River's official working example. Copy
   its patterns: `get_renderer(M, thinking=False).build_training_example(...)`, `train_step`, and `save_weights` in
   `mode="training"` and `mode="inference"`.
6. The concept to emulate: https://typesafe.ai/blog/introducing-system-one-models-and-jev. Jev is TypeSafe's "System One model":
   unstructured state in, **typed decisions with calibrated probabilities** out, all fields sampled in parallel, ~100ms. It's
   proprietary. **We build our own on River.**

## Secrets
`RIVER_API_KEY` (a River team key) and `ANTHROPIC_API_KEY` (for the teacher) must be set as environment variables in this
cloud environment. **Never print, log or commit them.** Nothing under `app/river/` may contain a key.

## What to build
The Sentinel reads a **blocker** (the text of a Claude Code hook event plus the agent's last message) and returns 5 typed
fields, each an enum with a probability distribution:

| Field | Labels |
|---|---|
| `kind` | credential, account, approval, rate_limit, billing, missing_info, dependency, failure |
| `quadrant` | do_now, schedule, delegate, drop (urgent×important) |
| `human_only` | yes, no (yes = needs a human: phone, CAPTCHA, payment, legal, entering a secret) |
| `department` | engineering, marketing, product_design, arts |
| `tier` | haiku, sonnet, opus, fable (the best Claude unit class to send, if not human-only) |

**Mechanism (fast and type-safe):**
- Map each label to a **single-token code** (e.g. `A`…`H`). Check with the base model's tokenizer that each code is exactly one token.
- Use one prompt per (item, field), and send all of them in **one batched** `client.sample` / `model.sample` call with `max_tokens=1`,
  `temperature=0` and `logprobs=K` (K ≥ the label count).
- Read the top-K logprobs at the single generated position, **keep only the allowed codes, and renormalize** to a distribution.
  The argmax is the label, so an invalid output is impossible by construction.
- Apply a per-field temperature (calibration) before the softmax.

## Also required: make it reusable for the in-app Research Center (SPEC §8.1)
- `app/river/train.py --data <jsonl>[,<jsonl>] --base <model> --steps N --out <dir>` streams one JSON line of progress per
  step to stdout: `{"step","loss","elapsed_s","checkpoint"?}`. The app launches it from the Research Center to retrain with
  human corrections (`app/data/corrections.jsonl`, rows `{"text", "fields": {...}}`, same label names).
- `app/river/eval.py --checkpoint <uri> --data <jsonl> --out <json>` writes the same metrics as `eval.json`.
- The sidecar gets `POST /reload {"checkpoint": "<uri>"}` (hot-swaps the active LoRA) and `GET /models` (known checkpoints + eval summaries).

## Speed gate + traditional fallback
- Report the Sentinel's measured live latency (p50/p95, batch of 10 blockers × 5 fields).
- **If p50 is over 1.5 s:** also train a **traditional classifier** for the live hot path, on the same labels: scikit-learn logistic
  regression per field over sentence embeddings (or TF-IDF), in `app/river/fast_clf.py`, with the model file under 5 MB.
  Serve it from the sidecar with `?engine=fast`. Keep the River model for eval, the Research Center and `--base`/trained A/B.
  A non-River model doesn't count for the River side quest, so the River base-vs-trained table is still mandatory.

## Steps and timeline
| By | Step | Output |
|---|---|---|
| +10 min | **Setup:** Python 3.12; `pip install river-client==0.12.0 anthropic transformers numpy`. Run `health_check()` and `get_capabilities()`. **Latency benchmark:** batch 40 one-token samples on `Qwen/Qwen3.5-9B` and on `nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4`, and pick the faster one that has a usable tokenizer and renderer (fallback: `Qwen/Qwen3.6-35B-A3B-FP8`) | `app/river/STATUS.md` (log each milestone here) |
| +25 min | **Policy + dataset.** Write `app/river/policy.md`, C&C's triage policy (start from the rules below). Use a Claude teacher (`claude-sonnet-5`; spot-check with `claude-opus-5`) to generate about **600 realistic blockers** in the style of real hook payloads: `PermissionRequest` (tool + input), `Notification` (permission_prompt / idle_prompt / agent_needs_input), `StopFailure` (`error`: authentication_failed / billing_error / rate_limit), and last assistant messages ("I need a GITHUB_TOKEN…", "Waiting on the logo from Arts…", "Signing up for TikTok requires a phone number…"). Cover all 4 departments. The teacher labels all 5 fields **by the policy**. Split: train 70%, val 10%, **test_unseen 20%** (services, vendors and phrasing styles never seen in train; hold out the vendors by name) | `app/river/data/{train,val,test_unseen}.jsonl`, `app/river/policy.md` |
| +45 min | **SFT:** one training example per (item, field). The prompt is a short instruction + blocker text + field question + the code→label legend, **without the policy rules** (the model has to learn them); the target is the single code. LoRA rank 16, lr 1e-4 to 2e-4, batch 32, about 60–120 `train_step`s. Log loss every step, and save **inference and training** checkpoints every 20 steps, keeping the best on val | `app/river/steps.jsonl`, `app/river/checkpoint.json` (`river://…` paths, base model) |
| +55 min | **Calibrate + eval:** fit one temperature per field on val (minimize NLL). On `test_unseen`, compare **base** (same prompt), **trained**, and **Claude Haiku** (`claude-haiku-4-5-20251001`, JSON output). Metrics: per-field accuracy and macro-F1, ECE and Brier, latency p50/p95 (batched, end-to-end), cost per 1k decisions | `app/river/eval.json`, `app/river/eval.md` (a table ready for the UI and the judges) |
| +65 min | **Sidecar:** `app/river/sidecar.py`, stdlib `http.server`, deps = river-client + transformers only. `GET /health`; `POST /classify {"items":[{"id":"...","text":"..."}]}` returns `{"results":[{"id","fields":{"kind":{"label","p","dist":{...}},...},"latency_ms"}],"model","checkpoint"}`. It holds one River session with the LoRA loaded (`create_model` + `load_weights`, or whatever `python-api.md` says is fastest), warms up on start, batches all items × fields in one call, and takes `--base` to serve the untrained base for the live A/B toggle. Port 7788, localhost only | `app/river/sidecar.py`, `app/river/README.md` (how to run it locally with `.venv-river`) |
| +70 min | **UI card data:** base model, dataset counts, 3 example rows, the loss curve (downsampled), the eval table, latency, checkpoint URI, and a one-line "what it learned" | `app/river/card.json` |

**Hard stops (PT):** dataset by **15:25**, training done by **15:50**, eval + sidecar by **16:00**. If you're behind, ship the best
partial checkpoint with an honest eval. Don't skip the base-vs-trained table: it's the side quest.

**Stretch (only if everything above is done):** the "calibrated decisions" idea from Jev. Run a short River RL pass (`guides_rl-sync.md`)
whose reward is the log score of the correct label, and report ECE before and after.

## Starting triage policy (put it in `policy.md`, then refine)
- Anything requiring a **phone number, CAPTCHA, payment, signing terms, legal identity, or entering a secret** → `human_only=yes`.
- Signups on X, TikTok, Instagram or LinkedIn → `account`, `human_only=yes` (their terms ban automated signups).
- A missing API key or token → `credential`, `do_now`, `human_only=yes`.
- `billing_error`, or credits exhausted → `billing`, `do_now`, `human_only=yes`.
- `rate_limit` or `overloaded` → `rate_limit`, `delegate`, `human_only=no`, tier `haiku` (wait and retry).
- Permission prompts for **read-only** commands → `approval`, `delegate`. For destructive or external-facing actions (push, deploy, post, delete) → `approval`, `schedule`, `human_only=yes`.
- Waiting on another department's output → `dependency`, `schedule`. Department = **the one being waited on**.
- "Waiting for your input" with nothing specific → `missing_info`, `drop`, unless a deadline is mentioned (→ `do_now`).
- Failing tests or build errors → `failure`, `engineering`, tier `sonnet` (tier `opus` if architectural).
- Department cues: code, PRs, CI → `engineering`; posts, launch, outreach → `marketing`; UX, landing page, flows → `product_design`; logo, brand, images, video → `arts`.
- Tier: trivial or lookup → `haiku`; routine implementation or writing → `sonnet`; complex multi-file work or strategy → `opus`; the hardest reasoning and long horizon → `fable`.

## Rules
- Touch only `app/river/**`. **Don't create River deployments** (they're gated and billed per hour). Keep total River spend under $20 and Anthropic spend under $15.
- Commit and push to the branch **`river-sentinel`** at every milestone (small commits; no data over 5 MB). Update `app/river/STATUS.md` each time.
- At the end, reply with: the checkpoint URI, the eval table, the measured latency, and the exact commands to run the sidecar locally.
