// Sentinel fast fallback in TypeScript: the same model file as fast_clf.py (TF-IDF over words, word pairs and char
// 4-grams + one logistic regression per field), so it runs inside the Bun server or the browser with no Python sidecar
// and no network. ~0.1 ms per blocker. Not the River model: that one is served by sidecar.py.
import model from "./fast_clf.json" with { type: "json" };

export const FIELDS = {
  kind: ["credential", "account", "approval", "rate_limit", "billing", "missing_info", "dependency", "failure"],
  quadrant: ["do_now", "schedule", "delegate", "drop"],
  human_only: ["yes", "no"],
  department: ["engineering", "marketing", "product_design", "arts"],
  tier: ["haiku", "sonnet", "opus", "fable"],
} as const;
export type Field = keyof typeof FIELDS;
export type FieldResult = { label: string; p: number; dist: Record<string, number> };
export type FastResult = Record<Field, FieldResult>;

type Model = { vocab: Record<string, number>; idf: number[]; W: Record<string, number[][]>; b: Record<string, number[]> };
const M = model as unknown as Model;
const vocab = new Map(Object.entries(M.vocab)); // a Map, so tokens like "constructor" can't hit Object.prototype

function feats(text: string): string[] {
  const w = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  const out = [...w];
  for (let i = 0; i + 1 < w.length; i++) out.push(`${w[i]} ${w[i + 1]}`);
  for (const x of w) if (x.length > 3) for (let i = 0; i < x.length - 3; i++) out.push(`#${x.slice(i, i + 4)}`);
  return out;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function classifyFast(text: string): FastResult {
  const counts = new Map<number, number>();
  for (const t of feats(text)) {
    const j = vocab.get(t);
    if (j !== undefined) counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  const x = new Map<number, number>();
  let norm = 0;
  for (const [j, c] of counts) {
    const v = (1 + Math.log(c)) * M.idf[j];
    x.set(j, v);
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  const out = {} as FastResult;
  for (const f of Object.keys(FIELDS) as Field[]) {
    const labels = FIELDS[f];
    const z = [...M.b[f]];
    for (const [j, v] of x) {
      const row = M.W[f][j];
      for (let k = 0; k < z.length; k++) z[k] += (v / norm) * row[k];
    }
    const m = Math.max(...z);
    const e = z.map((v) => Math.exp(v - m));
    const s = e.reduce((a, b) => a + b, 0);
    const p = e.map((v) => v / s);
    const k = p.indexOf(Math.max(...p));
    out[f] = { label: labels[k], p: r4(p[k]), dist: Object.fromEntries(labels.map((l, i) => [l, r4(p[i])])) };
  }
  return out;
}

/** Same response shape as the sidecar's POST /classify, so callers can swap engines. */
export function classifyFastBatch(items: { id: string; text: string }[]) {
  const t0 = performance.now();
  const fields = items.map((it) => classifyFast(it.text));
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  return { results: items.map((it, i) => ({ id: it.id, fields: fields[i], latency_ms: ms })), model: "fast_clf", checkpoint: "fast_clf.json", engine: "fast" };
}
