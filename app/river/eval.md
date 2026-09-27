# Sentinel eval: base vs trained on `test_unseen` (n=260, held-out vendors, tasks, phrasings, payload format)

Base model `Qwen/Qwen3.5-9B`. Trained checkpoint `river://60c2d383-71ea-4ef7-829e-3f7bc8c4a9fb/sampler_weights/sentinel-v1-s100-inf`. Temperatures fit per field on val (NLL, T >= 1). Uncalibrated mean ECE: base 0.1642, trained 0.048.

| Field | Base acc | Trained acc | Base macro-F1 | Trained macro-F1 | Base ECE | Trained ECE | Base Brier | Trained Brier |
|---|---|---|---|---|---|---|---|---|
| kind | 0.715 | **0.973** | 0.704 | **0.972** | 0.095 | 0.017 | 0.402 | 0.037 |
| quadrant | 0.354 | **0.904** | 0.239 | **0.919** | 0.152 | 0.043 | 0.703 | 0.158 |
| human_only | 0.796 | **0.962** | 0.783 | **0.961** | 0.102 | 0.018 | 0.319 | 0.041 |
| department | 0.600 | **0.992** | 0.542 | **0.993** | 0.085 | 0.015 | 0.486 | 0.009 |
| tier | 0.262 | **0.750** | 0.203 | **0.784** | 0.001 | 0.148 | 0.746 | 0.416 |
| mean | 0.545 | **0.916** | 0.494 | **0.926** | 0.087 | 0.048 | 0.531 | 0.132 |

All 5 fields exactly right: base 0.0538, trained **0.6731**.

- Latency (base): p50 2559 ms, p95 3300 ms (10 blockers x 5 fields = 50 prompts, 1 call).
- Cost (base): $0.0433 per 1k field decisions (141.8 prompt tokens each, $0.3/M assumed).
- Latency (trained): p50 3989 ms, p95 4396 ms (10 blockers x 5 fields = 50 prompts, 1 call).
- Cost (trained): $0.0433 per 1k field decisions (141.8 prompt tokens each, $0.3/M assumed).

## C&C simulator payloads (`app/data/events.jsonl`), label (p): base -> trained

| Payload | Field | Gold | Base | Trained |
|---|---|---|---|---|
| live0 | kind | credential | credential (0.97) | credential (1.00) |
|  | quadrant | do_now | do_now (0.72) | do_now (0.99) |
|  | human_only | yes | no (0.56) | yes (1.00) |
|  | department | engineering | engineering (0.97) | engineering (1.00) |
|  | tier | haiku | sonnet (0.26) | sonnet (0.57) |
| live1 | kind | account | account (0.80) | account (1.00) |
|  | quadrant | schedule | schedule (0.34) | schedule (0.97) |
|  | human_only | yes | no (0.68) | yes (0.94) |
|  | department | marketing | marketing (0.83) | marketing (1.00) |
|  | tier | sonnet | sonnet (0.26) | sonnet (0.74) |
| live2 | kind | rate_limit | rate_limit (1.00) | rate_limit (1.00) |
|  | quadrant | delegate | drop (0.37) | delegate (1.00) |
|  | human_only | no | no (0.85) | no (1.00) |
|  | department | engineering | engineering (0.94) | engineering (0.97) |
|  | tier | haiku | opus (0.26) | haiku (1.00) |
| live3 | kind | missing_info | missing_info (0.27) | missing_info (1.00) |
|  | quadrant | drop | drop (0.42) | drop (0.94) |
|  | human_only | no | no (0.84) | no (1.00) |
|  | department | marketing | marketing (0.83) | marketing (1.00) |
|  | tier | haiku | sonnet (0.26) | haiku (1.00) |
| live4 | kind | approval | approval (0.45) | approval (1.00) |
|  | quadrant | schedule | do_now (0.43) | schedule (0.96) |
|  | human_only | yes | no (0.73) | no (0.68) |
|  | department | product_design | product_design (0.95) | product_design (0.99) |
|  | tier | sonnet | sonnet (0.26) | sonnet (0.51) |

- Claude Haiku baseline: not run (no ANTHROPIC_API_KEY in the training environment).
