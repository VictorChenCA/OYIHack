"""Sentinel sidecar: local HTTP classifier on 127.0.0.1:7788 (stdlib http.server + river-client).

    python sidecar.py                      # serve the best trained checkpoint (checkpoint.json)
    python sidecar.py --base               # serve the untrained base (A/B)
    python sidecar.py --checkpoint river://...

GET  /health
POST /classify {"items":[{"id":"...","text":"..."}]}   ?engine=trained|base|fast  (default: the served engine)
     -> {"results":[{"id","fields":{"kind":{"label","p","dist"},...},"latency_ms"}],"model","checkpoint","engine"}
POST /reload {"checkpoint":"river://..."}                hot-swap the active LoRA (warms up before returning)
GET  /models                                             known checkpoints + eval summaries
"""
import argparse, json, os, sys, threading, time
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent))
import river_client as river
import sentinel as S

HERE = S.HERE

class Engine:
    def __init__(self, base, checkpoint, serve_base):
        self.base, self.checkpoint, self.serve_base = base, checkpoint, serve_base
        self.lock = threading.Lock()
        self.client = river.Client(api_key=os.environ["RIVER_API_KEY"])
        self._open_session()
        self.temps = self._temps_for(checkpoint)
        self.fast = None

    def _open_session(self):
        self._ctx = self.client.session(experiment="cc-sentinel-sidecar")
        self.session = self._ctx.__enter__()

    def _temps_for(self, ckpt):
        t = S.load_temps()
        return {k: v for k, v in t.items() if not k.startswith("_")} if t.get("_checkpoint") == ckpt else {}

    def _sample(self, prompts, engine):
        kw = dict(max_tokens=1, temperature=0.0, logprobs=S.TOPK)
        if engine == "base" or not self.checkpoint:
            return self.client.sample(prompts, base_model=self.base, **kw)
        try:
            out = self.session.sample(prompts, base_model=self.base, checkpoint=self.checkpoint, **kw)
        except Exception:  # a dead session: reopen once
            self._open_session()
            out = self.session.sample(prompts, base_model=self.base, checkpoint=self.checkpoint, **kw)
        return [o[0] for o in out]

    def classify(self, items, engine=None):
        engine = engine or ("base" if self.serve_base else "trained")
        texts = [it.get("text", "") for it in items]
        t0 = time.time()
        if engine == "fast":
            if self.fast is None:
                import fast_clf
                self.fast = fast_clf.load()
            fields = [self.fast.predict(t) for t in texts]
            ckpt = "fast_clf.json"
        else:
            prompts, index = S.build_batch(texts, self.base)
            samples = self._sample(prompts, engine)
            fields, _ = S.decode(samples, index, len(texts), temps={} if engine == "base" else self.temps, base=self.base)
            ckpt = "base" if engine == "base" else self.checkpoint
        ms = round((time.time() - t0) * 1000)
        return {"results": [{"id": it.get("id", str(i)), "fields": f, "latency_ms": ms} for i, (it, f) in enumerate(zip(items, fields))],
                "model": self.base, "checkpoint": ckpt, "engine": engine}

    def reload(self, ckpt):
        with self.lock:
            old = self.checkpoint
            self.checkpoint = ckpt
            try:
                self.classify([{"id": "warmup", "text": "StopFailure error=rate_limit"}], "trained")
            except Exception:
                self.checkpoint = old
                raise
            self.temps = self._temps_for(ckpt)
            self.serve_base = False
        return {"ok": True, "checkpoint": ckpt, "previous": old}

def known_models():
    models = []
    for p in [HERE / "checkpoint.json", *sorted((HERE / "runs").glob("*/checkpoint.json"))]:
        try:
            c = json.loads(p.read_text())
        except Exception:
            continue
        ev_path = p.parent / "eval.json"
        summary = None
        if ev_path.exists():
            ev = json.loads(ev_path.read_text())
            summary = {k: ev[k]["calibrated"]["mean"] for k in ("base", "trained") if k in ev}
        models.append({"name": c.get("name"), "base": c.get("base"), "best": c.get("best"),
                       "checkpoints": [{"step": x["step"], "inference": x["inference"], "val_acc": x.get("val_acc")}
                                       for x in c.get("checkpoints", [])],
                       "eval": summary, "source": str(p.relative_to(HERE))})
    return models

def make_handler(engine):
    class H(BaseHTTPRequestHandler):
        def _send(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            sys.stderr.write("[sidecar] " + fmt % args + "\n")

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/health":
                return self._send(200, {"ok": True, "model": engine.base, "checkpoint": engine.checkpoint,
                                        "engine": "base" if engine.serve_base else "trained", "calibrated": bool(engine.temps)})
            if path == "/models":
                return self._send(200, {"active": engine.checkpoint, "serving": "base" if engine.serve_base else "trained",
                                        "models": known_models()})
            self._send(404, {"error": "not found"})

        def do_POST(self):
            u = urlparse(self.path)
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            except Exception as e:
                return self._send(400, {"error": f"bad json: {e}"})
            try:
                if u.path == "/classify":
                    eng = parse_qs(u.query).get("engine", [body.get("engine")])[0]
                    return self._send(200, engine.classify(body.get("items", []), eng))
                if u.path == "/reload":
                    return self._send(200, engine.reload(body["checkpoint"]))
            except Exception as e:
                return self._send(500, {"error": repr(e)[:500]})
            self._send(404, {"error": "not found"})
    return H

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=7788)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--base", action="store_true", help="serve the untrained base model")
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--base-model", default=None)
    a = ap.parse_args()
    ck = {}
    try:
        ck = json.loads((HERE / "checkpoint.json").read_text())
    except Exception:
        pass
    base = a.base_model or ck.get("base") or S.BASE
    ckpt = a.checkpoint or (ck.get("best") or {}).get("inference")
    engine = Engine(base, ckpt, a.base or not ckpt)
    t0 = time.time()
    engine.classify([{"id": "warmup", "text": "StopFailure error=rate_limit | msg=\"429 Too Many Requests\""}])
    print(json.dumps({"listening": f"http://{a.host}:{a.port}", "model": base, "checkpoint": ckpt,
                      "serving": "base" if engine.serve_base else "trained", "warmup_ms": round((time.time() - t0) * 1000)}), flush=True)
    ThreadingHTTPServer((a.host, a.port), make_handler(engine)).serve_forever()

if __name__ == "__main__":
    main()
