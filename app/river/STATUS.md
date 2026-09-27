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

## Spend (River)
- Benchmark: ~240 one-token samples, well under $0.01.

## Haiku baseline
Not run (no `ANTHROPIC_API_KEY` in this environment).
