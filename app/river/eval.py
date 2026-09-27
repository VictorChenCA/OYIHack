"""Evaluate the Sentinel: base vs trained on held-out data. Writes eval.json (+ eval.md with --md).

    python eval.py --checkpoint river://... --data data/test_unseen.jsonl --out eval.json
    python eval.py --checkpoint base --data data/test_unseen.jsonl --out eval_base.json
    python eval.py --checkpoint river://... --compare-base --md eval.md --out eval.json   # the side-quest table

Per field: accuracy, macro-F1, ECE (10 bins, top label), Brier, NLL. Temperatures are fit per field on --val (min NLL)
and saved to calibration.json for the trained model. Latency: batches of 10 blockers x 5 fields, end-to-end.
"""
import argparse, json, math, os, statistics, sys, time
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import river_client as river
import sentinel as S

PRICE_PROMPT, PRICE_COMPLETION = 0.30, 0.80  # $/M tokens, low end of River's published range (smallest model)

def make_sampler(client, session, base, checkpoint):
    def run(prompts):
        kw = dict(max_tokens=1, temperature=0.0, logprobs=S.TOPK)
        if checkpoint in (None, "", "base"):
            return client.sample(prompts, base_model=base, **kw)
        return [o[0] for o in session.sample(prompts, base_model=base, checkpoint=checkpoint, **kw)]
    return run

def sample_all(sampler, prompts, chunk=250):
    chunks = [prompts[i:i + chunk] for i in range(0, len(prompts), chunk)]
    with ThreadPoolExecutor(4) as ex:
        outs = list(ex.map(sampler, chunks))
    return [s for o in outs for s in o]

def raw_logprobs(sampler, rows, base):
    prompts, index = S.build_batch([r["text"] for r in rows], base)
    samples = sample_all(sampler, prompts)
    _, raw = S.decode(samples, index, len(rows), base=base)
    ptoks = sum(S.n_tokens(p, base) for p in prompts)
    return raw, ptoks, len(prompts)

def nll(raw, rows, field, T):
    tot = 0.0
    for lp, r in zip(raw, rows):
        p = S.to_dist(lp[field], T)[S.FIELDS[field].index(r["fields"][field])]
        tot -= math.log(max(p, 1e-12))
    return tot / len(rows)

def fit_temps(raw, rows):
    # T >= 1 only: val is in-distribution and near-perfect, so an unconstrained fit sharpens (T -> 0.05) and hurts
    # calibration on the shifted test_unseen split. Softening only is the safe direction under shift.
    grid = [round(1.15 ** k, 4) for k in range(25)]  # 1 .. ~29
    return {f: min(grid, key=lambda T: nll(raw, rows, f, T)) for f in S.FIELDS}

def metrics(raw, rows, temps):
    out = {}
    for f, labs in S.FIELDS.items():
        y = [labs.index(r["fields"][f]) for r in rows]
        P = [S.to_dist(lp[f], temps.get(f, 1.0)) for lp in raw]
        pred = [max(range(len(p)), key=p.__getitem__) for p in P]
        acc = sum(a == b for a, b in zip(pred, y)) / len(y)
        f1s = []
        for k in range(len(labs)):
            tp = sum(p == k and t == k for p, t in zip(pred, y)); fp = sum(p == k and t != k for p, t in zip(pred, y))
            fn = sum(p != k and t == k for p, t in zip(pred, y))
            if tp + fp + fn == 0: continue  # label absent from both truth and predictions
            f1s.append(2 * tp / (2 * tp + fp + fn))
        conf = [max(p) for p in P]
        bins, ece = [[] for _ in range(10)], 0.0
        for c, a, b in zip(conf, pred, y):
            bins[min(int(c * 10), 9)].append((c, a == b))
        for bb in bins:
            if bb: ece += len(bb) / len(y) * abs(sum(c for c, _ in bb) / len(bb) - sum(ok for _, ok in bb) / len(bb))
        brier = sum(sum((p[k] - (k == t)) ** 2 for k in range(len(labs))) for p, t in zip(P, y)) / len(y)
        nl = -sum(math.log(max(p[t], 1e-12)) for p, t in zip(P, y)) / len(y)
        out[f] = {"acc": round(acc, 4), "macro_f1": round(sum(f1s) / len(f1s), 4), "ece": round(ece, 4),
                  "brier": round(brier, 4), "nll": round(nl, 4)}
    out["mean"] = {m: round(sum(out[f][m] for f in S.FIELDS) / len(S.FIELDS), 4)
                   for m in ["acc", "macro_f1", "ece", "brier", "nll"]}
    out["exact_all5"] = round(sum(all(S.FIELDS[f][max(range(len(S.FIELDS[f])), key=lambda k: S.to_dist(lp[f], temps.get(f, 1.0))[k])]
                                      == r["fields"][f] for f in S.FIELDS) for lp, r in zip(raw, rows)) / len(rows), 4)
    return out

def latency(sampler, rows, base, runs=10, n=10):
    lat = []
    for k in range(runs + 1):
        items = [rows[(k * n + j) % len(rows)]["text"] for j in range(n)]
        prompts, _ = S.build_batch(items, base)
        t0 = time.time(); sampler(prompts); dt = time.time() - t0
        if k: lat.append(dt * 1000)  # first call is warm-up
    lat.sort()
    return {"p50_ms": round(statistics.median(lat)), "p95_ms": round(lat[min(len(lat) - 1, int(0.95 * len(lat)))]),
            "batch": f"{n} blockers x {len(S.FIELDS)} fields = {n * len(S.FIELDS)} prompts, 1 call", "runs": runs}

def predictions(sampler, rows, base, temps):
    prompts, index = S.build_batch([r["text"] for r in rows], base)
    res, _ = S.decode(sample_all(sampler, prompts), index, len(rows), temps=temps, base=base)
    return [{"id": r.get("id"), "text": r["text"], "gold": r.get("fields"),
             "pred": {f: {"label": v["label"], "p": v["p"]} for f, v in p.items()}} for r, p in zip(rows, res)]

def evaluate(client, session, base, ckpt, rows, val, do_latency=True, examples=None):
    sampler = make_sampler(client, session, base, ckpt)
    raw_val, _, _ = raw_logprobs(sampler, val, base) if val else ([], 0, 0)
    raw, ptoks, nprompts = raw_logprobs(sampler, rows, base)
    temps = fit_temps(raw_val, val) if val else {}
    res = {"checkpoint": ckpt or "base", "n": len(rows),
           "uncalibrated": metrics(raw, rows, {}), "calibrated": metrics(raw, rows, temps), "temps": temps}
    tok_per_prompt = ptoks / max(nprompts, 1) if ptoks else None
    if tok_per_prompt:
        per_decision = tok_per_prompt * PRICE_PROMPT / 1e6 + PRICE_COMPLETION / 1e6
        res["cost_per_1k_decisions_usd"] = round(per_decision * 1000, 4)
        res["prompt_tokens_per_decision"] = round(tok_per_prompt, 1)
    if examples:
        res["examples"] = predictions(sampler, examples, base, temps)
    if do_latency:
        res["latency"] = latency(sampler, rows, base)
    return res

def md_table(ev):
    b, t = ev.get("base"), ev["trained"]
    lines = [f"# Sentinel eval: base vs trained on `test_unseen` (n={t['n']}, held-out vendors, tasks, phrasings, payload format)", "",
             f"Base model `{ev['base_model']}`. Trained checkpoint `{t['checkpoint']}`. Temperatures fit per field on val (NLL, T >= 1). Uncalibrated mean ECE: base "
             f"{b['uncalibrated']['mean']['ece'] if b else 'n/a'}, trained {t['uncalibrated']['mean']['ece']}.", "",
             "| Field | Base acc | Trained acc | Base macro-F1 | Trained macro-F1 | Base ECE | Trained ECE | Base Brier | Trained Brier |",
             "|---|---|---|---|---|---|---|---|---|"]
    for f in list(S.FIELDS) + ["mean"]:
        bc, tc = (b["calibrated"][f] if b else {}), t["calibrated"][f]
        g = lambda d, m: f"{d[m]:.3f}" if d and m in d else "n/a"
        lines.append(f"| {f} | {g(bc,'acc')} | **{g(tc,'acc')}** | {g(bc,'macro_f1')} | **{g(tc,'macro_f1')}** | "
                     f"{g(bc,'ece')} | {g(tc,'ece')} | {g(bc,'brier')} | {g(tc,'brier')} |")
    ex_b = b["calibrated"]["exact_all5"] if b else None
    lines += ["", f"All 5 fields exactly right: base {ex_b if ex_b is not None else 'n/a'}, trained **{t['calibrated']['exact_all5']}**.", ""]
    for name, r in [("base", b), ("trained", t)]:
        if r and "latency" in r:
            lines.append(f"- Latency ({name}): p50 {r['latency']['p50_ms']} ms, p95 {r['latency']['p95_ms']} ms ({r['latency']['batch']}).")
        if r and "cost_per_1k_decisions_usd" in r:
            lines.append(f"- Cost ({name}): ${r['cost_per_1k_decisions_usd']} per 1k field decisions "
                         f"({r['prompt_tokens_per_decision']} prompt tokens each, ${PRICE_PROMPT}/M assumed).")
    if t.get("examples"):
        lines += ["", "## C&C simulator payloads (`app/data/events.jsonl`), label (p): base -> trained", "",
                  "| Payload | Field | Gold | Base | Trained |", "|---|---|---|---|---|"]
        for k, te in enumerate(t["examples"]):
            be = b["examples"][k] if b and b.get("examples") else None
            for f in S.FIELDS:
                g = lambda e: f"{e['pred'][f]['label']} ({e['pred'][f]['p']:.2f})" if e else "n/a"
                lines.append(f"| {te['id'] if f == 'kind' else ''} | {f} | {te['gold'][f]} | {g(be)} | {g(te)} |")
        lines.append("")
    lines.append(f"- Claude Haiku baseline: {ev.get('haiku', 'not run (no ANTHROPIC_API_KEY in the training environment)')}.")
    return "\n".join(lines) + "\n"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True, help="river:// inference checkpoint, or 'base'")
    ap.add_argument("--data", default=str(S.HERE / "data/test_unseen.jsonl"))
    ap.add_argument("--val", default=str(S.HERE / "data/val.jsonl"))
    ap.add_argument("--base", default=S.BASE)
    ap.add_argument("--out", default=str(S.HERE / "eval.json"))
    ap.add_argument("--compare-base", action="store_true")
    ap.add_argument("--md", default=None)
    ap.add_argument("--no-latency", action="store_true")
    ap.add_argument("--examples", default=str(S.HERE / "data/live_app.jsonl"), help="extra rows to dump predictions for")
    ap.add_argument("--save-calibration", default=str(S.HERE / "calibration.json"))
    a = ap.parse_args()
    rows, val, exs = S.read_jsonl(a.data), S.read_jsonl(a.val), S.read_jsonl(a.examples)
    with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
        with client.session(experiment="cc-sentinel-eval") as session:
            ev = {"base_model": a.base, "data": a.data, "val": a.val}
            ev["trained"] = evaluate(client, session, a.base, a.checkpoint, rows, val, not a.no_latency, exs)
            print(json.dumps({"trained_mean": ev["trained"]["calibrated"]["mean"]}), flush=True)
            if a.compare_base and a.checkpoint != "base":
                ev["base"] = evaluate(client, session, a.base, "base", rows, val, not a.no_latency, exs)
                print(json.dumps({"base_mean": ev["base"]["calibrated"]["mean"]}), flush=True)
    Path(a.out).write_text(json.dumps(ev, indent=2))
    if a.checkpoint != "base" and a.save_calibration:
        Path(a.save_calibration).write_text(json.dumps({**ev["trained"]["temps"], "_checkpoint": a.checkpoint}, indent=2))
    if a.md:
        Path(a.md).write_text(md_table(ev))
    print(json.dumps({"out": a.out, "md": a.md}), flush=True)

if __name__ == "__main__":
    main()
