"""Latency with fast polling: the client polls sample results every 1.0 s by default; poll every 50 ms instead."""
import json, os, statistics, sys, time
from contextlib import closing
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import river_client as river
import river_client.client as rc
import sentinel as S

POLL = float(os.environ.get("POLL", "0.05"))
rc._SAMPLE_POLL_INTERVAL_SECS = POLL
base = sys.argv[1] if len(sys.argv) > 1 else S.BASE
ckj = json.loads(Path(sys.argv[2]).read_text())["best"] if len(sys.argv) > 2 else json.loads((S.HERE / "checkpoint.json").read_text())["best"]
rows = S.read_jsonl(S.HERE / "data/test_unseen.jsonl")
kw = dict(max_tokens=1, temperature=0.0, logprobs=S.TOPK)

def bench(name, fn, n_items=10, runs=8):
    lat = []
    for k in range(runs + 1):
        prompts, _ = S.build_batch([rows[(k * n_items + j) % len(rows)]["text"] for j in range(n_items)], base)
        t0 = time.time(); fn(prompts); dt = (time.time() - t0) * 1000
        if k: lat.append(dt)
    lat.sort()
    print(json.dumps({"base": base, "path": name, "items": n_items, "poll_s": POLL, "p50_ms": round(statistics.median(lat)),
                      "p95_ms": round(lat[-1]), "all": [round(x) for x in lat]}), flush=True)

with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
    with client.session(experiment="cc-sentinel-bench") as session:
        t0 = time.time()
        model = session.create_model(base_model=base, lora=river.LoraConfig(rank=16), checkpoint=ckj["training"])
        print(json.dumps({"base": base, "create_model_s": round(time.time() - t0, 1)}), flush=True)
        bench("model.sample in-memory LoRA", lambda p: model.sample(p, poll_interval=POLL, **kw))
        bench("model.sample in-memory LoRA", lambda p: model.sample(p, poll_interval=POLL, **kw), n_items=1)
        bench("session.sample(checkpoint)", lambda p: session.sample(p, base_model=base, checkpoint=ckj["inference"], **kw))
        bench("client.sample base", lambda p: client.sample(p, base_model=base, **kw))
