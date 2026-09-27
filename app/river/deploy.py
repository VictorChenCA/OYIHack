"""Create a dedicated River deployment for a Sentinel checkpoint and wait until it serves.

    python deploy.py river://.../sampler_weights/<name> [--replicas 1]
Appends {"id","checkpoint","base_url","model","status"} to deployments.json. Delete with: python deploy.py --delete <id>
"""
import argparse, json, os, sys, time
from contextlib import closing
from pathlib import Path
import river_client as river

HERE = Path(__file__).parent
REG = HERE / "deployments.json"

def save(rec):
    reg = json.loads(REG.read_text()) if REG.exists() else []
    reg = [r for r in reg if r["id"] != rec["id"]] + [rec]
    REG.write_text(json.dumps(reg, indent=2))

ap = argparse.ArgumentParser()
ap.add_argument("checkpoint", nargs="?")
ap.add_argument("--replicas", type=int, default=1)
ap.add_argument("--delete", default=None)
a = ap.parse_args()
with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as c:
    if a.delete:
        c.delete_deployment(a.delete, wait=True); print(json.dumps({"deleted": a.delete})); sys.exit()
    t0 = time.time()
    d = c.create_deployment(checkpoint=a.checkpoint, unified_replicas=a.replicas,
                            idempotency_key=a.checkpoint.rsplit("/", 1)[-1] + f"-r{a.replicas}", wait=False)
    rec = {"id": d.id, "checkpoint": a.checkpoint, "base_url": getattr(d, "base_url", None), "model": getattr(d, "model", None),
           "status": str(getattr(d, "status", getattr(d, "phase", "")))}
    save(rec); print(json.dumps({"created": rec}), flush=True)
    d = c.wait_for_deployment(d.id, timeout=1800)
    rec.update(base_url=getattr(d, "base_url", None), model=getattr(d, "model", None),
               status=str(getattr(d, "status", getattr(d, "phase", ""))), ready_s=round(time.time() - t0))
    save(rec); print(json.dumps({"ready": rec}), flush=True)
