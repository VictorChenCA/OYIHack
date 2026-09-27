"""Build card.json (the Sentinel's UI card) from checkpoint.json, steps.jsonl, eval.json and the dataset."""
import json
from pathlib import Path

HERE = Path(__file__).parent

def jl(p):
    return [json.loads(l) for l in open(p) if l.strip()] if Path(p).exists() else []

ck = json.loads((HERE / "checkpoint.json").read_text())
ev = json.loads((HERE / "eval.json").read_text())
steps = [s for s in jl(HERE / "steps.jsonl") if "step" in s]
fast = json.loads((HERE / "fast_clf_eval.json").read_text()) if (HERE / "fast_clf_eval.json").exists() else None
data = {s: jl(HERE / f"data/{s}.jsonl") for s in ["train", "val", "test_unseen"]}
k = max(1, len(steps) // 25)
tr, bs = ev["trained"], ev.get("base")

def row(r):
    return {f: {m: v[m] for m in ("acc", "macro_f1", "ece", "brier")} for f, v in r["calibrated"].items() if f != "exact_all5"}

examples = [data["test_unseen"][i] for i in (0, 2, 3)] if len(data["test_unseen"]) > 3 else data["test_unseen"]
card = {
    "name": "Sentinel",
    "tagline": "C&C's System One model: blocker text in, 5 typed, calibrated decisions out, trained on River.",
    "base_model": ck["base"],
    "checkpoint": ck["best"]["inference"],
    "training_checkpoint": ck["best"]["training"],
    "best_step": ck["best"]["step"],
    "lora": {"rank": ck.get("rank"), "lr": ck.get("lr"), "batch": ck.get("batch")},
    "dataset": {"train": len(data["train"]), "val": len(data["val"]), "test_unseen": len(data["test_unseen"]),
                "training_examples": ck.get("examples"), "teacher": "Claude (policy.md), no Anthropic key: Claude authored the generator"},
    "examples": [{"text": e["text"], "labels": e["fields"]} for e in examples],
    "loss_curve": [{"step": s["step"], "loss": round(s["loss"], 4)} for s in steps[::k]] + ([{"step": steps[-1]["step"], "loss": round(steps[-1]["loss"], 4)}] if steps else []),
    "val_curve": [{"step": c["step"], "val_acc": round(c["val_acc"], 4)} for c in ck.get("checkpoints", []) if c.get("val_acc") is not None],
    "eval": {"data": "test_unseen (held-out vendors, tasks, phrasings, payload format)", "n": tr["n"],
             "trained": row(tr), "base": row(bs) if bs else None,
             "exact_all5": {"trained": tr["calibrated"]["exact_all5"], "base": bs["calibrated"]["exact_all5"] if bs else None},
             "haiku": "not run (no ANTHROPIC_API_KEY)", "fast_clf": fast},
    "live_app_payloads": [{"text": t["text"], "gold": t["gold"], "trained": t["pred"], "base": b["pred"] if b else None}
                          for t, b in zip(tr.get("examples", []), (bs or {}).get("examples", []) or [None] * len(tr.get("examples", [])))],
    "latency": {"trained": tr.get("latency"), "base": bs.get("latency") if bs else None},
    "cost_per_1k_decisions_usd": tr.get("cost_per_1k_decisions_usd"),
    "calibration_temps": tr.get("temps"),
    "what_it_learned": None,
}
m_t, m_b = tr["calibrated"]["mean"], (bs["calibrated"]["mean"] if bs else None)
gain = {f: round(tr["calibrated"][f]["acc"] - bs["calibrated"][f]["acc"], 3) for f in ("kind", "quadrant", "human_only", "department", "tier")} if bs else {}
top = sorted(gain, key=gain.get, reverse=True)[:2]
card["what_it_learned"] = (f"C&C's triage policy without ever seeing it: mean accuracy {m_b['acc']:.0%} -> {m_t['acc']:.0%} on unseen vendors/phrasings; "
                           f"biggest gains on {top[0]} (+{gain[top[0]]:.0%}) and {top[1]} (+{gain[top[1]]:.0%}), e.g. rate limits are delegated to haiku, "
                           f"destructive approvals are gold, a dependency belongs to the department being waited on.") if bs else "see eval"
(HERE / "card.json").write_text(json.dumps(card, indent=2))
print(json.dumps({"card": "card.json", "what_it_learned": card["what_it_learned"]}))
