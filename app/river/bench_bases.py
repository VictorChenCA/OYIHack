"""Base-model latency floor per architecture on River's shared sampling API (10 blockers x 5 fields, 1 call, 6 runs)."""
import json, os, statistics, sys, time
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import river_client as river
import sentinel as S
rows = S.read_jsonl(S.HERE / "data/test_unseen.jsonl")

def run(base):
    try:
        with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as c:
            lat = []
            for k in range(7):
                prompts, _ = S.build_batch([rows[(k * 10 + j) % len(rows)]["text"] for j in range(10)], base)
                t0 = time.time(); c.sample(prompts, base_model=base, max_tokens=1, temperature=0.0, logprobs=S.TOPK)
                if k: lat.append((time.time() - t0) * 1000)
            lat.sort()
            r = {"base": base, "p50_ms": round(statistics.median(lat)), "p95_ms": round(lat[-1]), "all": [round(x) for x in lat]}
    except Exception as e:
        r = {"base": base, "error": repr(e)[:200]}
    print(json.dumps(r), flush=True); return r

B = sys.argv[1:]
with ThreadPoolExecutor(len(B)) as ex:
    out = list(ex.map(run, B))
Path(S.HERE / "bench_bases.json").write_text(json.dumps(out, indent=2))
