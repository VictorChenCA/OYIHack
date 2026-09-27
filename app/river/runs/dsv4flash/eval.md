# Sentinel eval: base vs trained on `test_unseen` (n=260, held-out vendors, tasks, phrasings, payload format)

Base model `deepseek-ai/DeepSeek-V4-Flash-0731`. Trained checkpoint `river://92b6361c-a442-4258-97e5-871094b763d1/sampler_weights/sentinel-dsv4flash-s080-inf`. Temperatures fit per field on val (NLL, T >= 1). Uncalibrated mean ECE: base 0.31, trained 0.027.

| Field | Base acc | Trained acc | Base macro-F1 | Trained macro-F1 | Base ECE | Trained ECE | Base Brier | Trained Brier |
|---|---|---|---|---|---|---|---|---|
| kind | 0.758 | **0.996** | 0.741 | **0.996** | 0.076 | 0.005 | 0.332 | 0.009 |
| quadrant | 0.535 | **0.981** | 0.307 | **0.987** | 0.119 | 0.004 | 0.666 | 0.035 |
| human_only | 0.500 | **1.000** | 0.413 | **1.000** | 0.213 | 0.001 | 0.491 | 0.000 |
| department | 0.515 | **0.927** | 0.361 | **0.927** | 0.183 | 0.061 | 0.551 | 0.122 |
| tier | 0.358 | **0.781** | 0.181 | **0.708** | 0.020 | 0.046 | 0.702 | 0.301 |
| mean | 0.533 | **0.937** | 0.401 | **0.923** | 0.122 | 0.024 | 0.548 | 0.094 |

All 5 fields exactly right: base 0.0423, trained **0.6923**.

- Cost (base): $0.0402 per 1k field decisions (131.2 prompt tokens each, $0.3/M assumed).
- Cost (trained): $0.0402 per 1k field decisions (131.2 prompt tokens each, $0.3/M assumed).

## C&C simulator payloads (`app/data/events.jsonl`), label (p): base -> trained

| Payload | Field | Gold | Base | Trained |
|---|---|---|---|---|
| live0 | kind | credential | credential (1.00) | credential (1.00) |
|  | quadrant | do_now | do_now (0.54) | do_now (1.00) |
|  | human_only | yes | yes (0.78) | yes (1.00) |
|  | department | engineering | engineering (0.87) | engineering (0.99) |
|  | tier | haiku | sonnet (0.40) | haiku (0.44) |
| live1 | kind | account | account (0.56) | account (1.00) |
|  | quadrant | schedule | do_now (0.39) | schedule (0.99) |
|  | human_only | yes | yes (0.69) | yes (1.00) |
|  | department | marketing | marketing (0.47) | marketing (1.00) |
|  | tier | sonnet | sonnet (0.38) | sonnet (0.78) |
| live2 | kind | rate_limit | rate_limit (1.00) | rate_limit (1.00) |
|  | quadrant | delegate | do_now (0.47) | delegate (0.98) |
|  | human_only | no | yes (0.62) | no (1.00) |
|  | department | engineering | engineering (0.82) | engineering (0.69) |
|  | tier | haiku | sonnet (0.45) | haiku (1.00) |
| live3 | kind | missing_info | approval (0.35) | missing_info (1.00) |
|  | quadrant | drop | do_now (0.48) | drop (0.97) |
|  | human_only | no | yes (0.69) | no (1.00) |
|  | department | marketing | marketing (0.57) | marketing (0.98) |
|  | tier | haiku | haiku (0.34) | haiku (1.00) |
| live4 | kind | approval | approval (0.93) | approval (1.00) |
|  | quadrant | schedule | do_now (0.43) | schedule (0.99) |
|  | human_only | yes | yes (0.65) | yes (1.00) |
|  | department | product_design | engineering (0.65) | product_design (0.99) |
|  | tier | sonnet | sonnet (0.46) | sonnet (0.83) |

- Claude Haiku baseline: not run (no ANTHROPIC_API_KEY in the training environment).
