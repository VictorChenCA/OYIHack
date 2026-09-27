"""Speed-gate fallback: a traditional classifier for the live hot path (not the River model).

TF-IDF over word unigrams+bigrams and char 4-grams, one multinomial logistic regression per field, numpy only (no scikit-learn in
.venv-river). Same labels and output shape as the Sentinel. Model file: fast_clf.json (well under 5 MB).

    python fast_clf.py --train data/train.jsonl --val data/val.jsonl --test data/test_unseen.jsonl
"""
import argparse, json, math, re, time
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
FIELDS = {
    "kind": ["credential", "account", "approval", "rate_limit", "billing", "missing_info", "dependency", "failure"],
    "quadrant": ["do_now", "schedule", "delegate", "drop"],
    "human_only": ["yes", "no"],
    "department": ["engineering", "marketing", "product_design", "arts"],
    "tier": ["haiku", "sonnet", "opus", "fable"],
}
TOK = re.compile(r"[a-z0-9_]+")

def feats(text):
    w = TOK.findall(text.lower())
    ch = [f"#{x[i:i + 4]}" for x in w if len(x) > 3 for i in range(len(x) - 3)]  # char 4-grams: unseen vendor names
    return w + [a + " " + b for a, b in zip(w, w[1:])] + ch

class Fast:
    def __init__(self, vocab, idf, W, b):
        self.vocab, self.idf, self.W, self.b = vocab, np.asarray(idf), {f: np.asarray(v) for f, v in W.items()}, \
            {f: np.asarray(v) for f, v in b.items()}

    def vec(self, texts):
        X = np.zeros((len(texts), len(self.vocab)), dtype=np.float32)
        for i, t in enumerate(texts):
            for tok, c in Counter(feats(t)).items():
                j = self.vocab.get(tok)
                if j is not None: X[i, j] = (1 + math.log(c)) * self.idf[j]
        n = np.linalg.norm(X, axis=1, keepdims=True); n[n == 0] = 1
        return X / n

    def proba(self, texts):
        X = self.vec(texts)
        out = {}
        for f in FIELDS:
            z = X @ self.W[f] + self.b[f]
            z -= z.max(1, keepdims=True); e = np.exp(z)
            out[f] = e / e.sum(1, keepdims=True)
        return out

    def predict(self, text):
        P = self.proba([text])
        res = {}
        for f, labs in FIELDS.items():
            p = P[f][0]; k = int(p.argmax())
            res[f] = {"label": labs[k], "p": round(float(p[k]), 4), "dist": {l: round(float(p[j]), 4) for j, l in enumerate(labs)}}
        return res

    def save(self, path):
        Path(path).write_text(json.dumps({"vocab": self.vocab, "idf": [round(float(x), 4) for x in self.idf],
                                          "W": {f: np.round(w, 4).tolist() for f, w in self.W.items()},
                                          "b": {f: np.round(v, 4).tolist() for f, v in self.b.items()}}))

def load(path=HERE / "fast_clf.json"):
    d = json.loads(Path(path).read_text())
    return Fast(d["vocab"], d["idf"], d["W"], d["b"])

def rows(p):
    return [json.loads(l) for l in open(p) if l.strip()]

def train(train_rows, min_count=2, max_vocab=6000, l2=1e-3, iters=400, lr=2.0):
    df = Counter(t for r in train_rows for t in set(feats(r["text"])))
    toks = [t for t, c in df.most_common(max_vocab) if c >= min_count]
    vocab = {t: i for i, t in enumerate(toks)}
    N = len(train_rows)
    idf = np.array([math.log((1 + N) / (1 + df[t])) + 1 for t in toks], dtype=np.float32)
    m = Fast(vocab, idf, {}, {})
    X = m.vec([r["text"] for r in train_rows])
    for f, labs in FIELDS.items():
        idx = [(i, labs.index(r["fields"][f])) for i, r in enumerate(train_rows) if r.get("fields", {}).get(f) in labs]
        Xi = X[[i for i, _ in idx]]; Y = np.zeros((len(idx), len(labs)), dtype=np.float32)
        Y[np.arange(len(idx)), [k for _, k in idx]] = 1
        W = np.zeros((X.shape[1], len(labs)), dtype=np.float32); b = np.zeros(len(labs), dtype=np.float32)
        for _ in range(iters):  # full-batch gradient descent on softmax cross-entropy + L2
            z = Xi @ W + b; z -= z.max(1, keepdims=True); P = np.exp(z); P /= P.sum(1, keepdims=True)
            G = (P - Y) / len(idx)
            W -= lr * (Xi.T @ G + l2 * W); b -= lr * G.sum(0)
        m.W[f], m.b[f] = W, b
    return m

def accuracy(m, rs):
    P = m.proba([r["text"] for r in rs])
    per = {f: float(np.mean([labs[int(P[f][i].argmax())] == r["fields"][f] for i, r in enumerate(rs)])) for f, labs in FIELDS.items()}
    per["mean"] = float(np.mean(list(per.values())))
    return {k: round(v, 4) for k, v in per.items()}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", default=str(HERE / "data/train.jsonl"))
    ap.add_argument("--val", default=str(HERE / "data/val.jsonl"))
    ap.add_argument("--test", default=str(HERE / "data/test_unseen.jsonl"))
    ap.add_argument("--out", default=str(HERE / "fast_clf.json"))
    a = ap.parse_args()
    tr = [r for p in a.train.split(",") if Path(p).exists() for r in rows(p)]
    t0 = time.time(); m = train(tr); fit_s = time.time() - t0
    m.save(a.out)
    te = rows(a.test)
    t0 = time.time(); [m.predict(r["text"]) for r in te[:10]]; ms10 = (time.time() - t0) * 1000
    rep = {"val": accuracy(m, rows(a.val)), "test_unseen": accuracy(m, te), "fit_s": round(fit_s, 1),
           "latency_ms_10_items": round(ms10, 1), "model_bytes": Path(a.out).stat().st_size}
    (HERE / "fast_clf_eval.json").write_text(json.dumps(rep, indent=2))
    print(json.dumps(rep))
