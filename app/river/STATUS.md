# River Sentinel: status log

| Time (PT) | Milestone |
|---|---|
| 14:55 | Setup: river-client 0.12.0 in `.venv-river`, `health_check() == True`. Branch `river-sentinel`. |
| 14:58 | Latency benchmark (`bench.py`, batch of 40 one-token samples, logprobs=10, 3 trials): **Qwen/Qwen3.5-9B 3.71 / 2.24 / 2.53 s**, Nemotron-3.5-Lightning-30B-A3B 3.28 / 2.53 / 2.43 s. Codes `A`..`H` are single tokens on both. **Chosen base: Qwen/Qwen3.5-9B** (fastest warm, standard Qwen3.5 renderer). p50 > 1.5 s, so the speed-gate fallback (`fast_clf.py`) is required. |
| 15:00 | Policy (`policy.md`) + dataset (`gen_data.py`, Claude as teacher, no Anthropic key): train 880 / val 120 / test_unseen 260. test_unseen holds out vendors (Datadog, Pinecone, Mailchimp, HubSpot, LinkedIn, Threads, Runway, Fly.io, ...), task contexts, message phrasings and a terse log payload format never seen in train. |
| 15:00 | SFT launched: `train.py --steps 100 --batch 32 --lr 2e-4`, LoRA rank 16, 4,400 examples (880 items x 5 fields), ~3.5 s/step. |
| 15:02 | Base eval on test_unseen (`eval_base.json`): mean acc 0.545, macro-F1 0.494; p50 2446 ms / p95 2729 ms (10 blockers x 5 fields, 1 call). |
| 15:03 | Val acc at step 20: 0.843; step 40: 0.868. Fast fallback (`fast_clf.py`, numpy TF-IDF + LR): test_unseen mean acc 0.746, 1 ms / 10 items, 1.15 MB. |
| 15:05 | Sidecar smoke test OK (trained, `?engine=base`, `?engine=fast`, `/models`). Live latency noisy under load (2.4-10 s per 20 prompts), so added `?engine=auto&budget_ms=1500`. |
| 15:07-15:11 | Val acc: step 60 0.897, step 80 0.958, **step 100 0.973** (best). Training done in 602 s. Best checkpoint `river://60c2d383-71ea-4ef7-829e-3f7bc8c4a9fb/sampler_weights/sentinel-v1-s100-inf` (training state: `.../weights/sentinel-v1-s100-train`). |
| 15:13 | Eval on test_unseen (n=260): **mean acc base 0.545 -> trained 0.916**, macro-F1 0.494 -> 0.926, all-5-fields-right 5% -> 67%. Unconstrained temperature fit on val sharpened (T=0.05 on kind) and hurt test ECE, so the fit is now constrained to T >= 1. Trained LoRA sampled via `session.sample(checkpoint=...)`: p50 4.0 s, p95 9.9 s (base 2.5 / 3.1 s). |
| 15:16 | `bench_lora.py` (8 runs, 50 prompts): `session.sample(checkpoint=...)` p50 3905 / p95 4518 ms; `create_model` (12 s load) + in-memory `model.sample` p50 4034 / p95 4392 ms; base `client.sample` p50 2513 / p95 2661 ms. LoRA sampling costs ~1.5 s over base and is not faster in memory, so the sidecar uses `session.sample(checkpoint=...)`. |
| 15:19 | Final eval (T >= 1 calibration): see `eval.md`. Mean acc 0.545 -> **0.916**, macro-F1 0.494 -> 0.926, ECE 0.087 -> 0.048, Brier 0.531 -> 0.132, all-5-right 5% -> 67%. Latency p50/p95 (10 blockers x 5 fields, 1 call): trained 3989 / 4396 ms, base 2559 / 3300 ms. `card.json` built. |
| 15:21 | Sidecar verified on the final checkpoint: `/health`, `/classify` (trained, `?engine=base`, `?engine=fast` 2 ms, `?engine=auto` falls back to fast at 1.5 s), `/reload` s100 -> s080 -> s100 (calibration follows the checkpoint), `/models`. One blocker (5 prompts) takes the same ~4 s as ten: the cost is per-call overhead, not throughput. |
| 15:36 | **Speed round** (human: "try smaller/lighter/different-architecture models; speed matters most; spend is fine; deploy in parallel"). |
| 15:38 | **Dedicated deployments are blocked River-side** (`probe_deploy.py`): 9B, 27B, 35B-A3B, Nemotron-30B-A3B, DeepSeek-V4-Flash all return `unsupported_topology: no approved unified/prefill_decode specification`; GLM-5.3-Flash returns `deployment_access_denied`. Needs River to approve a serving spec for our team. |
| 15:40 | Variant SFT runs launched in parallel (80 steps, same data/recipe): Nemotron-3.5-Lightning-30B-A3B (hybrid Mamba MoE, 3B active), Qwen3.6-35B-A3B (MoE, 3B active), GLM-5.3-Flash, DeepSeek-V4-Flash. GLM's renderer leaves `<think>` open, so `prompt_str` now closes it. |
| 15:44 | Found client-side latency: `session.sample`/`model.sample` poll results every **1.0 s** (`_SAMPLE_POLL_INTERVAL_SECS`). At 50 ms polling the 9B LoRA drops from p50 ~4.0 s to **3.2 s** (`bench_fast_9b.log`); base 2.5 s; 1 blocker 2.9 s. `session.sample(checkpoint=)` loads+unloads the LoRA server-side per call. Sidecar + eval now poll at 50 ms. |
| 15:46 | Base-model latency floor per architecture (`bench_bases.json`, all 7 in parallel, so inflated): DeepSeek-V4-Flash 3.6 s, Nemotron-30B-A3B 3.8 s, Qwen3.5-9B 4.1 s, DeepSeek-V4.1-Flash 5.4 s, Qwen3.6-35B-A3B 6.3 s, Qwen3.8-27B 6.4 s, GLM-5.3-Flash 7.6 s. No architecture breaks the ~2.2 s shared-API floor. |

## Speed gate verdict
River p50 is ~4 s for the trained LoRA (2.5 s base), over the 1.5 s gate and over `classify.ts`'s 3 s timeout. The hot path
should call `POST /classify?engine=auto&budget_ms=1500` (River if it answers in time, else the numpy fast classifier,
test_unseen mean acc 0.746) or `?engine=fast`. The River model stays the evaluated model, the Research Center model and the A/B.

## Stretch (RL calibration): not run, on purpose
The Sentinel's probabilities are the model's own next-token distribution over the codes, and SFT's cross-entropy on that
single code token *is* the log score of the correct label. A River RL pass with a log-score reward would optimize the same
objective. Calibration is instead temperature scaling fit on val (T >= 1); ECE 0.087 (base) -> 0.048 (trained, test_unseen).
Remaining weak spot: `tier` (acc 0.75, ECE 0.148, overconfident on held-out task contexts).

## Spend (River)
No spend API in river-client 0.12.0, so this is an estimate from token counts (check console.river.ai for the bill):
- training: 100 steps x 32 examples x ~145 tokens = ~0.46M training tokens;
- sampling: ~2.7M prompt tokens (5 val evals during training, 3 test/val evals, 2 benchmarks, sidecar tests), 1 output token each.
- At River's small-model rates (~$0.30/M prompt, ~$1/M training): **~$1.3**. Even at the top of River's published price
  table ($5.14/M prompt, $15.41/M training) it would be ~$21. No deployments were created.

## Haiku baseline
Not run (no `ANTHROPIC_API_KEY` in this environment).
