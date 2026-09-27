"""Probe which base models accept a dedicated deployment (unified, then prefill/decode). Accepted ones stay up for latency tests."""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import river_client as river

HERE = Path(__file__).parent
BASES = sys.argv[1:]
KNOWN = {"Qwen/Qwen3.5-9B": "river://60c2d383-71ea-4ef7-829e-3f7bc8c4a9fb/sampler_weights/sentinel-v1-s100-inf"}

def probe(base):
    rec = {"base": base}
    with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as c:
        try:
            ck = KNOWN.get(base)
            if not ck:
                with c.session(experiment="cc-sentinel-probe") as s:
                    m = s.create_model(base_model=base, lora=river.LoraConfig(rank=16))
                    ck = m.save_weights(f"probe-{base.split('/')[-1][:24]}-{int(time.time())}", mode="inference").path
            rec["checkpoint"] = ck
            for topo in ({"unified_replicas": 1}, {"prefill_replicas": 1, "decode_replicas": 1}):
                try:
                    d = c.create_deployment(checkpoint=ck, idempotency_key=f"probe-{abs(hash((ck, str(topo))))}", wait=False, **topo)
                    rec.update(ok=True, topology=topo, id=d.id, base_url=getattr(d, "base_url", None), model=getattr(d, "model", None))
                    break
                except Exception as e:
                    rec.setdefault("errors", []).append(f"{topo}: {str(e)[:160]}")
        except Exception as e:
            rec["error"] = repr(e)[:300]
    print(json.dumps(rec), flush=True)
    return rec

with ThreadPoolExecutor(len(BASES)) as ex:
    out = list(ex.map(probe, BASES))
(HERE / "probe_deploy.json").write_text(json.dumps(out, indent=2))
