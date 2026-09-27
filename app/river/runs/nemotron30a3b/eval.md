# Sentinel eval: base vs trained on `test_unseen` (n=260, held-out vendors, tasks, phrasings, payload format)

Base model `nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4`. Trained checkpoint `river://5271b646-d0ff-4f2d-9f7b-60792f32947b/sampler_weights/sentinel-nemotron30a3b-s080-inf`. Temperatures fit per field on val (NLL, T >= 1). Uncalibrated mean ECE: base 0.1432, trained 0.1019.

| Field | Base acc | Trained acc | Base macro-F1 | Trained macro-F1 | Base ECE | Trained ECE | Base Brier | Trained Brier |
|---|---|---|---|---|---|---|---|---|
| kind | 0.327 | **0.950** | 0.300 | **0.940** | 0.122 | 0.049 | 0.844 | 0.094 |
| quadrant | 0.381 | **0.865** | 0.256 | **0.798** | 0.060 | 0.040 | 0.678 | 0.174 |
| human_only | 0.569 | **0.996** | 0.393 | **0.996** | 0.062 | 0.005 | 0.498 | 0.005 |
| department | 0.508 | **0.892** | 0.416 | **0.876** | 0.068 | 0.083 | 0.586 | 0.182 |
| tier | 0.296 | **0.612** | 0.203 | **0.523** | 0.015 | 0.090 | 0.716 | 0.478 |
| mean | 0.416 | **0.863** | 0.314 | **0.827** | 0.065 | 0.053 | 0.664 | 0.187 |

All 5 fields exactly right: base 0.0462, trained **0.4308**.

- Cost (base): $0.0448 per 1k field decisions (146.8 prompt tokens each, $0.3/M assumed).
- Cost (trained): $0.0448 per 1k field decisions (146.8 prompt tokens each, $0.3/M assumed).

## C&C simulator payloads (`app/data/events.jsonl`), label (p): base -> trained

| Payload | Field | Gold | Base | Trained |
|---|---|---|---|---|
| live0 | kind | credential | failure (0.46) | credential (1.00) |
|  | quadrant | do_now | schedule (0.33) | do_now (1.00) |
|  | human_only | yes | no (0.51) | yes (1.00) |
|  | department | engineering | engineering (0.87) | engineering (1.00) |
|  | tier | haiku | sonnet (0.33) | haiku (0.73) |
| live1 | kind | account | account (0.31) | account (1.00) |
|  | quadrant | schedule | delegate (0.37) | schedule (0.84) |
|  | human_only | yes | no (0.51) | yes (1.00) |
|  | department | marketing | marketing (0.39) | marketing (1.00) |
|  | tier | sonnet | sonnet (0.30) | haiku (0.57) |
| live2 | kind | rate_limit | rate_limit (0.77) | rate_limit (1.00) |
|  | quadrant | delegate | schedule (0.34) | drop (0.78) |
|  | human_only | no | no (0.51) | no (1.00) |
|  | department | engineering | engineering (0.76) | engineering (0.99) |
|  | tier | haiku | sonnet (0.32) | haiku (0.96) |
| live3 | kind | missing_info | billing (0.26) | missing_info (1.00) |
|  | quadrant | drop | schedule (0.35) | drop (1.00) |
|  | human_only | no | no (0.51) | no (1.00) |
|  | department | marketing | marketing (0.63) | marketing (1.00) |
|  | tier | haiku | sonnet (0.32) | haiku (0.88) |
| live4 | kind | approval | failure (0.29) | approval (1.00) |
|  | quadrant | schedule | schedule (0.38) | schedule (0.52) |
|  | human_only | yes | no (0.51) | yes (1.00) |
|  | department | product_design | engineering (0.34) | engineering (1.00) |
|  | tier | sonnet | sonnet (0.30) | haiku (0.55) |

- Claude Haiku baseline: not run (no ANTHROPIC_API_KEY in the training environment).
