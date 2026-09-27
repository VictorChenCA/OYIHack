# River Sentinel: status log

| Time (PT) | Milestone |
|---|---|
| 14:55 | Setup: river-client 0.12.0 in `.venv-river`, `health_check() == True`. Branch `river-sentinel`. |
| 14:58 | Latency benchmark (`bench.py`, batch of 40 one-token samples, logprobs=10, 3 trials): **Qwen/Qwen3.5-9B 3.71 / 2.24 / 2.53 s**, Nemotron-3.5-Lightning-30B-A3B 3.28 / 2.53 / 2.43 s. Codes `A`..`H` are single tokens on both. **Chosen base: Qwen/Qwen3.5-9B** (fastest warm, standard Qwen3.5 renderer). p50 > 1.5 s, so the speed-gate fallback (`fast_clf.py`) is required. |
| 15:00 | Policy (`policy.md`) + dataset (`gen_data.py`, Claude as teacher, no Anthropic key): train 880 / val 120 / test_unseen 260. test_unseen holds out vendors (Datadog, Pinecone, Mailchimp, HubSpot, LinkedIn, Threads, Runway, Fly.io, ...), task contexts, message phrasings and a terse log payload format never seen in train. |

## Spend (River)
- Benchmark: ~240 one-token samples, well under $0.01.

## Haiku baseline
Not run (no `ANTHROPIC_API_KEY` in this environment).
