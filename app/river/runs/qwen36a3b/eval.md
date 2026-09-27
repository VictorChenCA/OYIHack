# Sentinel eval: base vs trained on `test_unseen` (n=260, held-out vendors, tasks, phrasings, payload format)

Base model `Qwen/Qwen3.6-35B-A3B-FP8`. Trained checkpoint `river://e563d05c-dba6-4d14-9df5-9cf0b0c944d1/sampler_weights/sentinel-qwen36a3b-s080-inf`. Temperatures fit per field on val (NLL, T >= 1). Uncalibrated mean ECE: base 0.1921, trained 0.0629.

| Field | Base acc | Trained acc | Base macro-F1 | Trained macro-F1 | Base ECE | Trained ECE | Base Brier | Trained Brier |
|---|---|---|---|---|---|---|---|---|
| kind | 0.708 | **0.962** | 0.668 | **0.954** | 0.074 | 0.029 | 0.340 | 0.071 |
| quadrant | 0.400 | **0.915** | 0.185 | **0.888** | 0.162 | 0.028 | 0.646 | 0.132 |
| human_only | 0.777 | **0.989** | 0.776 | **0.988** | 0.025 | 0.009 | 0.312 | 0.010 |
| department | 0.642 | **0.996** | 0.539 | **0.996** | 0.100 | 0.003 | 0.465 | 0.008 |
| tier | 0.304 | **0.804** | 0.239 | **0.831** | 0.025 | 0.207 | 0.739 | 0.388 |
| mean | 0.566 | **0.933** | 0.481 | **0.931** | 0.077 | 0.055 | 0.500 | 0.122 |

All 5 fields exactly right: base 0.0615, trained **0.7115**.

- Cost (base): $0.0433 per 1k field decisions (141.8 prompt tokens each, $0.3/M assumed).
- Cost (trained): $0.0433 per 1k field decisions (141.8 prompt tokens each, $0.3/M assumed).

## C&C simulator payloads (`app/data/events.jsonl`), label (p): base -> trained

| Payload | Field | Gold | Base | Trained |
|---|---|---|---|---|
| live0 | kind | credential | credential (1.00) | credential (1.00) |
|  | quadrant | do_now | do_now (0.54) | do_now (1.00) |
|  | human_only | yes | yes (0.75) | yes (1.00) |
|  | department | engineering | engineering (0.98) | engineering (1.00) |
|  | tier | haiku | sonnet (0.27) | sonnet (0.75) |
| live1 | kind | account | account (0.57) | account (1.00) |
|  | quadrant | schedule | do_now (0.38) | schedule (0.97) |
|  | human_only | yes | yes (0.91) | yes (1.00) |
|  | department | marketing | marketing (0.90) | marketing (1.00) |
|  | tier | sonnet | sonnet (0.27) | sonnet (0.90) |
| live2 | kind | rate_limit | rate_limit (0.99) | rate_limit (1.00) |
|  | quadrant | delegate | do_now (0.45) | drop (0.72) |
|  | human_only | no | no (0.68) | no (1.00) |
|  | department | engineering | engineering (0.88) | engineering (1.00) |
|  | tier | haiku | sonnet (0.27) | haiku (1.00) |
| live3 | kind | missing_info | missing_info (0.72) | missing_info (0.98) |
|  | quadrant | drop | schedule (0.30) | drop (0.98) |
|  | human_only | no | no (0.80) | no (1.00) |
|  | department | marketing | marketing (0.82) | marketing (1.00) |
|  | tier | haiku | sonnet (0.28) | haiku (1.00) |
| live4 | kind | approval | approval (0.95) | approval (1.00) |
|  | quadrant | schedule | do_now (0.40) | schedule (0.73) |
|  | human_only | yes | yes (0.87) | yes (1.00) |
|  | department | product_design | engineering (0.39) | product_design (1.00) |
|  | tier | sonnet | sonnet (0.27) | sonnet (0.87) |

- Claude Haiku baseline: not run (no ANTHROPIC_API_KEY in the training environment).
