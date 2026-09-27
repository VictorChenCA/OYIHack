# Sentinel variants: speed round

| Base (architecture) | Trained p50 / p95 (10 blockers x 5 fields) | Base p50 | Val acc | test_unseen acc base -> trained | All 5 right |
|---|---|---|---|---|---|
| Qwen/Qwen3.5-9B (served) (dense 9B) | 3175 / 4301 ms | 2496 ms | 0.973 | 0.545 -> 0.916 | 0.673 |
| nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4 (hybrid Mamba-Transformer MoE, 3B active) | 3375 / 3501 ms | 2903 ms | 0.915 | 0.416 -> 0.863 | 0.431 |
| zai-org/GLM-5.3-Flash (GLM MoE) | 7274 / 9976 ms | 6416 ms | 0.978 | 0.501 -> 0.939 | 0.719 |
| deepseek-ai/DeepSeek-V4-Flash-0731 (DeepSeek MoE) | 5419 / 6292 ms | 2776 ms | 0.980 | 0.533 -> 0.937 | 0.692 |
| Qwen/Qwen3.6-35B-A3B-FP8 (Qwen MoE, 3B active) | … / … ms | … ms | 0.897 | … -> … | … |
| Local fast fallback (TF-IDF + LR, numpy; not River) | ~2 ms | n/a | 0.955 | n/a -> 0.771 | n/a |
