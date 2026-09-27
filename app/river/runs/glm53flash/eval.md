# Sentinel eval: base vs trained on `test_unseen` (n=260, held-out vendors, tasks, phrasings, payload format)

Base model `zai-org/GLM-5.3-Flash`. Trained checkpoint `river://1f961282-acb7-496e-bf46-6863f3e0b966/sampler_weights/sentinel-glm53flash-s080-inf`. Temperatures fit per field on val (NLL, T >= 1). Uncalibrated mean ECE: base 0.2717, trained 0.049.

| Field | Base acc | Trained acc | Base macro-F1 | Trained macro-F1 | Base ECE | Trained ECE | Base Brier | Trained Brier |
|---|---|---|---|---|---|---|---|---|
| kind | 0.704 | **0.996** | 0.687 | **0.996** | 0.086 | 0.004 | 0.452 | 0.003 |
| quadrant | 0.361 | **0.985** | 0.133 | **0.977** | 0.142 | 0.008 | 0.686 | 0.022 |
| human_only | 0.615 | **0.996** | 0.585 | **0.996** | 0.088 | 0.003 | 0.444 | 0.007 |
| department | 0.481 | **0.935** | 0.415 | **0.934** | 0.140 | 0.054 | 0.565 | 0.108 |
| tier | 0.342 | **0.785** | 0.219 | **0.710** | 0.030 | 0.112 | 0.721 | 0.333 |
| mean | 0.501 | **0.939** | 0.408 | **0.923** | 0.097 | 0.036 | 0.574 | 0.095 |

All 5 fields exactly right: base 0.0346, trained **0.7192**.

- Cost (base): $0.0416 per 1k field decisions (136.1 prompt tokens each, $0.3/M assumed).
- Cost (trained): $0.0416 per 1k field decisions (136.1 prompt tokens each, $0.3/M assumed).

## C&C simulator payloads (`app/data/events.jsonl`), label (p): base -> trained

| Payload | Field | Gold | Base | Trained |
|---|---|---|---|---|
| live0 | kind | credential | credential (0.43) | credential (1.00) |
|  | quadrant | do_now | do_now (0.56) | do_now (1.00) |
|  | human_only | yes | yes (0.69) | yes (1.00) |
|  | department | engineering | engineering (0.81) | engineering (1.00) |
|  | tier | haiku | haiku (0.38) | sonnet (0.77) |
| live1 | kind | account | account (0.69) | account (1.00) |
|  | quadrant | schedule | do_now (0.43) | schedule (1.00) |
|  | human_only | yes | yes (0.87) | yes (1.00) |
|  | department | marketing | engineering (0.49) | marketing (1.00) |
|  | tier | sonnet | haiku (0.32) | sonnet (0.97) |
| live2 | kind | rate_limit | rate_limit (0.71) | rate_limit (1.00) |
|  | quadrant | delegate | do_now (0.58) | delegate (1.00) |
|  | human_only | no | yes (0.66) | no (1.00) |
|  | department | engineering | engineering (0.79) | engineering (1.00) |
|  | tier | haiku | haiku (0.34) | haiku (1.00) |
| live3 | kind | missing_info | missing_info (0.38) | missing_info (1.00) |
|  | quadrant | drop | do_now (0.36) | drop (1.00) |
|  | human_only | no | yes (0.69) | no (1.00) |
|  | department | marketing | engineering (0.67) | marketing (1.00) |
|  | tier | haiku | haiku (0.36) | haiku (0.95) |
| live4 | kind | approval | approval (0.92) | approval (1.00) |
|  | quadrant | schedule | do_now (0.50) | schedule (1.00) |
|  | human_only | yes | yes (0.50) | yes (1.00) |
|  | department | product_design | engineering (0.40) | product_design (1.00) |
|  | tier | sonnet | haiku (0.37) | sonnet (0.92) |

- Claude Haiku baseline: not run (no ANTHROPIC_API_KEY in the training environment).
