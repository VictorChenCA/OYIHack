"""Sentinel core: prompts, one-token label codes, and logprob -> calibrated distribution.

Every (item, field) pair is one prompt. All prompts go out in ONE batched sample call with max_tokens=1, temperature=0
and logprobs=K. We read the top-K logprobs at the single generated position, keep only the allowed codes, apply the
field's temperature and renormalize, so an invalid label is impossible by construction.
"""
import json, math, os
from pathlib import Path

HERE = Path(__file__).parent
BASE = "Qwen/Qwen3.5-9B"
TOPK = 20

FIELDS = {
    "kind": ["credential", "account", "approval", "rate_limit", "billing", "missing_info", "dependency", "failure"],
    "quadrant": ["do_now", "schedule", "delegate", "drop"],
    "human_only": ["yes", "no"],
    "department": ["engineering", "marketing", "product_design", "arts"],
    "tier": ["haiku", "sonnet", "opus", "fable"],
}
CODES = "ABCDEFGH"
QUESTIONS = {
    "kind": "What kind of blocker is this?",
    "quadrant": "Which Eisenhower quadrant (urgent x important) does it belong in?",
    "human_only": "Does resolving it require a human?",
    "department": "Which department should handle it?",
    "tier": "Which Claude unit class is the best fit to send?",
}

def user_prompt(text, field):
    legend = " ".join(f"{CODES[i]}={lab}" for i, lab in enumerate(FIELDS[field]))
    return (f"You are Sentinel, the blocker triage model of an AI agent command center.\n"
            f"<blocker>\n{text}\n</blocker>\n"
            f"Field: {field}. {QUESTIONS[field]}\nCodes: {legend}\nAnswer with exactly one code letter.")

_renderer = {}
def renderer(base=BASE):
    if base not in _renderer:
        from river_client.renderers import get_renderer
        _renderer[base] = get_renderer(base, thinking=False)
    return _renderer[base]

_code_ids = {}
def code_ids(base=BASE):
    """token id of each code letter (checked to be exactly one token)."""
    if base not in _code_ids:
        from river_client.tokenizers import load_tokenizer
        tok = load_tokenizer(base_model=base)
        ids = {}
        for c in CODES:
            t = tok.encode(c, add_special_tokens=False)
            assert len(t) == 1, f"code {c!r} is {len(t)} tokens on {base}"
            ids[c] = t[0]
        _code_ids[base] = ids
    return _code_ids[base]

_tok = {}
def n_tokens(prompt, base=BASE):
    if base not in _tok:
        from river_client.tokenizers import load_tokenizer
        _tok[base] = load_tokenizer(base_model=base)
    return len(_tok[base].encode(prompt, add_special_tokens=False))

def prompt_str(text, field, base=BASE):
    p = renderer(base).build_sample_prompt([{"role": "user", "content": user_prompt(text, field)}]).to_kwargs()["prompt"]
    # GLM leaves "<think>" open (its training example is "<think></think>A"), so close it: the next token is the code
    return p + "</think>" if p.endswith("<think>") else p

def training_example(text, field, label, base=BASE):
    code = CODES[FIELDS[field].index(label)]
    msgs = [{"role": "user", "content": user_prompt(text, field)}, {"role": "assistant", "content": code}]
    return renderer(base).build_training_example(msgs, train_on_eos=True, max_length=None).to_dict()

def build_batch(texts, base=BASE):
    """-> (prompts, index) where index[j] = (item_idx, field)."""
    prompts, index = [], []
    for i, t in enumerate(texts):
        for f in FIELDS:
            prompts.append(prompt_str(t, f, base))
            index.append((i, f))
    return prompts, index

FLOOR = -30.0  # logprob for an allowed code that is not in the top-K

def code_logprobs(sample, field, base=BASE):
    """allowed-code logprobs at the single generated position (FLOOR when outside the top-K)."""
    ids = code_ids(base)
    top = (sample.top_logprobs or [[]])[0]
    by_id = {t.token_id: t.logprob for t in top}
    if sample.tokens and sample.logprobs:  # the sampled token itself
        by_id.setdefault(sample.tokens[0], sample.logprobs[0])
    return [by_id.get(ids[CODES[i]], FLOOR) for i in range(len(FIELDS[field]))]

def to_dist(lps, temp=1.0):
    z = [lp / temp for lp in lps]
    m = max(z)
    e = [math.exp(v - m) for v in z]
    s = sum(e)
    return [v / s for v in e]

def load_temps(path=HERE / "calibration.json"):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return {}

def sample_batch(sampler, prompts, base=BASE):
    """sampler: a River client/session/model with .sample(); returns a flat list of Sample (one per prompt)."""
    out = sampler(prompts)
    return [o[0] if isinstance(o, list) else o for o in out]

def decode(samples, index, n_items, temps=None, base=BASE):
    temps = temps or {}
    res = [dict() for _ in range(n_items)]
    raw = [dict() for _ in range(n_items)]
    for s, (i, f) in zip(samples, index):
        lps = code_logprobs(s, f, base)
        p = to_dist(lps, temps.get(f, 1.0))
        k = max(range(len(p)), key=p.__getitem__)
        res[i][f] = {"label": FIELDS[f][k], "p": round(p[k], 4),
                     "dist": {lab: round(p[j], 4) for j, lab in enumerate(FIELDS[f])}}
        raw[i][f] = lps
    return res, raw

def read_jsonl(paths):
    rows = []
    for p in str(paths).split(","):
        p = p.strip()
        if p and os.path.exists(p):
            with open(p) as fh:
                rows += [json.loads(l) for l in fh if l.strip()]
    return rows
