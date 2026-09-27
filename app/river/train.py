"""Train the Sentinel (LoRA SFT on River). Streams one JSON line of progress per step to stdout.

    python train.py --data data/train.jsonl[,../data/corrections.jsonl] --base Qwen/Qwen3.5-9B --steps 100 --out .

Rows: {"text": ..., "fields": {field: label, ...}} (partial `fields` are fine: human corrections relabel one field).
Writes <out>/steps.jsonl and <out>/checkpoint.json (river:// paths; best on val = the one to serve).
"""
import argparse, json, os, random, sys, time
from contextlib import closing
from datetime import timedelta
from pathlib import Path

import river_client as river
import sentinel as S

def emit(obj, fh=None):
    line = json.dumps(obj)
    print(line, flush=True)
    if fh:
        fh.write(line + "\n"); fh.flush()

def val_accuracy(model, rows, base):
    texts = [r["text"] for r in rows]
    prompts, index = S.build_batch(texts, base)
    out = model.sample(prompts, max_tokens=1, temperature=0.0, logprobs=S.TOPK)
    samples = [o[0] for o in out]
    res, _ = S.decode(samples, index, len(texts), base=base)
    per = {f: sum(res[i][f]["label"] == r["fields"][f] for i, r in enumerate(rows)) / len(rows) for f in S.FIELDS}
    return sum(per.values()) / len(per), per

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(S.HERE / "data/train.jsonl"))
    ap.add_argument("--val", default=str(S.HERE / "data/val.jsonl"))
    ap.add_argument("--base", default=S.BASE)
    ap.add_argument("--steps", type=int, default=100)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--save-every", type=int, default=20)
    ap.add_argument("--name", default=f"sentinel-{time.strftime('%H%M%S')}")
    ap.add_argument("--init", default=None, help="river:// training checkpoint to continue from")
    ap.add_argument("--out", default=str(S.HERE))
    a = ap.parse_args()

    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rows = S.read_jsonl(a.data)
    val = S.read_jsonl(a.val)
    exs = [S.training_example(r["text"], f, lab, a.base)
           for r in rows for f, lab in r["fields"].items() if f in S.FIELDS and lab in S.FIELDS[f]]
    rng = random.Random(0)
    rng.shuffle(exs)
    emit({"event": "start", "base": a.base, "rows": len(rows), "examples": len(exs), "val_rows": len(val),
          "steps": a.steps, "batch": a.batch, "lr": a.lr, "rank": a.rank, "name": a.name})

    steps_fh = open(out / "steps.jsonl", "w")
    ckpts, best = [], None
    t0 = time.time()
    with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
        with client.session(experiment="cc-sentinel") as session:
            model = session.create_model(base_model=a.base, lora=river.LoraConfig(rank=a.rank))
            if a.init:
                model.load_weights(a.init, load_optimizer=True)
            cur = 0
            for step in range(1, a.steps + 1):
                if cur + a.batch > len(exs):
                    rng.shuffle(exs); cur = 0
                batch = exs[cur:cur + a.batch]; cur += a.batch
                fb, opt = model.train_step(batch, lr=a.lr, loss_fn="cross_entropy")  # no auto-retry
                loss = fb.metrics.get("loss_mean", fb.metrics.get("loss"))
                rec = {"step": step, "loss": loss, "elapsed_s": round(time.time() - t0, 1)}
                if step % a.save_every == 0 or step == a.steps:
                    inf = model.save_weights(f"{a.name}-s{step:03d}-inf", mode="inference")
                    trn = model.save_weights(f"{a.name}-s{step:03d}-train", mode="training", ttl=timedelta(days=30))
                    acc, per = val_accuracy(model, val, a.base) if val else (None, {})
                    c = {"step": step, "inference": inf.path, "training": trn.path, "val_acc": acc, "val_per_field": per}
                    ckpts.append(c)
                    if acc is not None and (best is None or acc >= best["val_acc"]):
                        best = c
                    rec.update(checkpoint=inf.path, val_acc=acc)
                    (out / "checkpoint.json").write_text(json.dumps(
                        {"base": a.base, "name": a.name, "best": best or c, "checkpoints": ckpts,
                         "data": a.data, "examples": len(exs), "lr": a.lr, "rank": a.rank, "batch": a.batch}, indent=2))
                emit(rec, steps_fh)
    emit({"event": "done", "best": best, "elapsed_s": round(time.time() - t0, 1)})

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    main()
