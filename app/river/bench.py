"""Latency benchmark: one batched 1-token sample call (40 prompts, logprobs) per candidate base."""
import json, os, sys, time
from contextlib import closing
import river_client as river
from river_client.renderers import get_renderer

BASES = sys.argv[1:] or ["Qwen/Qwen3.5-9B", "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4"]
MSG = ("Classify this agent blocker.\nBLOCKER: StopFailure error=rate_limit. 'API Error: 429 Too Many Requests'\n"
       "Field: kind. Codes: A=credential B=account C=approval D=rate_limit E=billing F=missing_info G=dependency H=failure\n"
       "Answer with one code letter.")

with closing(river.Client(api_key=os.environ["RIVER_API_KEY"])) as client:
    print("health", client.health_check(), flush=True)
    for base in BASES:
        rec = {"base": base}
        try:
            r = get_renderer(base, thinking=False)
            sp = r.build_sample_prompt([{"role": "user", "content": MSG}])
            kw = sp.to_kwargs()
            tok = r.tokenizer if hasattr(r, "tokenizer") else None
            rec["prompt_kwargs"] = list(kw)
            codes = {}
            try:
                from river_client import load_tokenizer
            except ImportError:
                from river_client.tokenizers import load_tokenizer
            t = load_tokenizer(base_model=base)
            for c in "ABCDEFGH":
                codes[c] = t.encode(c, add_special_tokens=False)
            rec["codes_single_token"] = all(len(v) == 1 for v in codes.values())
            ptoks = kw.get("prompt_token_ids") or kw.get("model_input")
            lat = []
            for trial in range(3):
                t0 = time.time()
                out = client.sample(base_model=base, max_tokens=1, temperature=0.0, logprobs=10,
                                    prompts=[kw["prompt"]] * 40)
                lat.append(round(time.time() - t0, 3))
            s = out[0]
            rec["latency_s"] = lat
            rec["text"] = s.text
            rec["top"] = [(x.token, round(x.logprob, 3)) for x in (s.top_logprobs or [[]])[0]][:8]
        except Exception as e:
            rec["error"] = repr(e)[:500]
        print(json.dumps(rec), flush=True)
