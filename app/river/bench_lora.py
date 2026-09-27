"""Latency: sampling the trained LoRA via session.sample(checkpoint=...) vs create_model(checkpoint=...) + model.sample."""
import json, os, statistics, sys, time
from contextlib import closing
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import river_client as river
import sentinel as S

ck = json.loads((S.HERE / "checkpoint.json").read_text())["best"]
rows = S.read_jsonl(S.HERE / "data/test_unseen.jsonl")
kw = dict(max_tokens=1, temperature=0.0, logprobs=S.TOPK)

def bench(name, fn, runs=8):
    lat = []
    for k in range(runs + 1):
        prompts, _ = S.build_batch([rows[(k * 10 + j) % len(rows)]["text"] for j in range(10)])
        t0 = time.time(); fn(prompts); dt = (time.time() - t0) * 1000
        if k: lat.append(dt)
    lat.sort()
    print(json.dumps({"path": name, "p50_ms": round(statistics.median(lat)), "p95_ms": round(lat[-1]), "all": [round(x) for x in lat]}), flush=True)

with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
    with client.session(experiment="cc-sentinel-bench") as session:
        bench("session.sample(checkpoint)", lambda p: session.sample(p, base_model=S.BASE, checkpoint=ck["inference"], **kw))
        t0 = time.time()
        model = session.create_model(base_model=S.BASE, lora=river.LoraConfig(rank=16), checkpoint=ck["training"])
        print(json.dumps({"create_model_s": round(time.time() - t0, 1)}), flush=True)
        bench("model.sample (in-memory LoRA)", lambda p: model.sample(p, **kw))
        bench("client.sample (base)", lambda p: client.sample(p, base_model=S.BASE, **kw))
