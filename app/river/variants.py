"""Collect the speed-round variants into variants.json / variants.md."""
import json
from pathlib import Path
HERE = Path(__file__).parent

def jl(p):
    return [json.loads(l) for l in open(p) if l.strip().startswith("{")] if Path(p).exists() else []

def lora_p50(log):
    for r in jl(log):
        if r.get("path") == "session.sample(checkpoint)": return r["p50_ms"], r["p95_ms"]
    return None, None

def base_p50(log):
    for r in jl(log):
        if r.get("path") == "client.sample base": return r["p50_ms"]
    return None

V = [("Qwen/Qwen3.5-9B (served)", "", HERE / "checkpoint.json", HERE / "eval.json", HERE / "bench_fast_9b.log", "dense 9B", 100)]
for n, b, arch in [("nemotron30a3b", "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4", "hybrid Mamba-Transformer MoE, 3B active"),
                   ("glm53flash", "zai-org/GLM-5.3-Flash", "GLM MoE"),
                   ("dsv4flash", "deepseek-ai/DeepSeek-V4-Flash-0731", "DeepSeek MoE"),
                   ("qwen36a3b", "Qwen/Qwen3.6-35B-A3B-FP8", "Qwen MoE, 3B active")]:
    V.append((b, n, HERE / f"runs/{n}/checkpoint.json", HERE / f"runs/{n}/eval.json", HERE / f"runs/{n}/bench_fast.log", arch, 80))
rows = []
for name, n, ck, ev, bench, arch, steps in V:
    c = json.loads(ck.read_text()) if ck.exists() else {}
    e = json.loads(ev.read_text()) if ev.exists() else {}
    lp50, lp95 = lora_p50(bench)
    rows.append({"base": name, "arch": arch, "steps": steps, "checkpoint": (c.get("best") or {}).get("inference"),
                 "val_acc": (c.get("best") or {}).get("val_acc"),
                 "test_acc_trained": e.get("trained", {}).get("calibrated", {}).get("mean", {}).get("acc"),
                 "test_acc_base": e.get("base", {}).get("calibrated", {}).get("mean", {}).get("acc"),
                 "test_all5": e.get("trained", {}).get("calibrated", {}).get("exact_all5"),
                 "lora_p50_ms": lp50, "lora_p95_ms": lp95, "base_p50_ms": base_p50(bench)})
(HERE / "variants.json").write_text(json.dumps(rows, indent=2))
f = lambda x, d=3: "…" if x is None else (f"{x:.{d}f}" if isinstance(x, float) else str(x))
md = ["| Base (architecture) | Trained p50 / p95 (10 blockers x 5 fields) | Base p50 | Val acc | test_unseen acc base -> trained | All 5 right |",
      "|---|---|---|---|---|---|"]
for r in rows:
    md.append(f"| {r['base']} ({r['arch']}) | {f(r['lora_p50_ms'])} / {f(r['lora_p95_ms'])} ms | {f(r['base_p50_ms'])} ms | {f(r['val_acc'])} | "
              f"{f(r['test_acc_base'])} -> {f(r['test_acc_trained'])} | {f(r['test_all5'])} |")
md.append("| Local fast fallback (TF-IDF + LR, numpy; not River) | ~2 ms | n/a | 0.955 | n/a -> 0.771 | n/a |")
(HERE / "variants.md").write_text("# Sentinel variants: speed round\n\n" + "\n".join(md) + "\n")
print("\n".join(md))
