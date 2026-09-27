// J1 history importer: rebuilds today's company history from Claude Code transcripts on disk.
// Pure parsing (no world mutation): ~/.claude/projects/<dir containing "OYIHack">/<sessionId>.jsonl = mothership,
// <sessionId>/subagents/**/agent-<agentId>.jsonl (+ .meta.json) = its subagents. Never logs transcript content.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import type { PermissionMode, TokenUsage } from "../shared/types";

export interface ParsedTranscript {
  path: string;
  records: number;
  startedAt: number;
  endedAt: number;
  firstPrompt?: string;
  model?: string;            // normalized (no [1m], no date suffix)
  longContext: boolean;
  tokens: TokenUsage;
  costUsd: number;
  contextUsed: number;
  toolCount: number;
  failCount: number;
  lastTool?: string;
  permissionMode?: PermissionMode;
  cwd?: string;
  riverScore: number;        // mentions of River Sentinel work (app/river, river_client, sentinel training)
  aiTitle?: string;
}

export interface ParsedSubagent extends ParsedTranscript { agentId: string; agentType?: string; description?: string }
export interface ParsedSession extends ParsedTranscript { sessionId: string; dir: string; subagents: ParsedSubagent[] }

/** $/MTok (input, output). Cache read 0.1x input, cache write 1.25x input. */
export function priceOf(model?: string): [number, number] {
  const m = (model ?? "").toLowerCase();
  if (m.includes("haiku")) return [1, 5];
  if (m.includes("sonnet")) return [2, 10];
  if (m.includes("fable")) return [10, 50];
  if (/opus-5-5|opus-5\.5/.test(m)) return [4, 20];
  if (m.includes("opus")) return [5, 25];
  return [2, 10];
}

export function normModel(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/\[1m\]/i, "").replace(/-\d{8}$/, "").trim() || undefined;
}

const PREAMBLE = /^You are (an agent|a unit) in C&C[\s\S]*?\n\n/;
function realPromptText(content: unknown): string | undefined {
  const texts: string[] = [];
  if (typeof content === "string") texts.push(content);
  else if (Array.isArray(content)) for (const b of content) if (b && (b as any).type === "text" && typeof (b as any).text === "string") texts.push((b as any).text);
  for (let t of texts) {
    t = t.trim();
    if (!t || t.startsWith("<") || t.startsWith("[Request interrupted") || /^\[(Pasted|Image)/.test(t)) continue;
    if (t.startsWith("Caveat:")) continue;
    t = t.replace(PREAMBLE, "").trim();
    // workflow harness wrappers: keep the computed task body, drop the frame line
    t = t.replace(/^\[Workflow harness[^\]]*\][^\n]*\n?/, "").trim();
    if (t) return t;
  }
  return undefined;
}

const RIVER_RE = /app\/river|river_client|sentinel[-_ ]?(v1|train|training)|train\.py/g;

export function parseTranscript(path: string): ParsedTranscript | null {
  let raw: string;
  try { raw = readFileSync(path, "utf8"); } catch { return null; }
  const out: ParsedTranscript = {
    path, records: 0, startedAt: 0, endedAt: 0, longContext: false,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0, contextUsed: 0, toolCount: 0, failCount: 0, riverScore: 0,
  };
  const seen = new Set<string>();
  let rawModel: string | undefined;
  const usageById = new Map<string, any>();
  for (const line of raw.split("\n")) {
    if (!line.startsWith("{")) continue;
    let d: any; try { d = JSON.parse(line); } catch { continue; }
    out.records++;
    const ts = d.timestamp ? Date.parse(d.timestamp) : NaN;
    if (!Number.isNaN(ts)) { if (!out.startedAt || ts < out.startedAt) out.startedAt = ts; if (ts > out.endedAt) out.endedAt = ts; }
    if (d.cwd && !out.cwd) out.cwd = String(d.cwd);
    if (d.type === "permission-mode" && d.permissionMode) out.permissionMode = d.permissionMode;
    if (d.type === "ai-title" && typeof d.aiTitle === "string") out.aiTitle = d.aiTitle;
    if (d.type === "user" && !d.isMeta) {
      const c = d.message?.content;
      if (!out.firstPrompt) { const p = realPromptText(c); if (p) out.firstPrompt = p; }
      if (Array.isArray(c)) for (const b of c) if (b?.type === "tool_result" && b.is_error) out.failCount++;
    }
    if (d.type === "assistant" && d.message) {
      const m = d.message;
      if (m.model && m.model !== "<synthetic>") rawModel = m.model;
      if (Array.isArray(m.content)) for (const b of m.content) if (b?.type === "tool_use") {
        const id = b.id ?? `${m.id}:${out.toolCount}`;
        if (!seen.has("t:" + id)) { seen.add("t:" + id); out.toolCount++; out.lastTool = b.name; }
      }
      if (m.usage) usageById.set(m.id ?? `r${out.records}`, { u: m.usage, model: m.model });
    }
  }
  if (!out.records) return null;
  for (const { u, model } of usageById.values()) {
    const i = u.input_tokens ?? 0, o = u.output_tokens ?? 0, cr = u.cache_read_input_tokens ?? 0, cw = u.cache_creation_input_tokens ?? 0;
    out.tokens.input += i; out.tokens.output += o; out.tokens.cacheRead += cr; out.tokens.cacheWrite += cw;
    const [pi, po] = priceOf(normModel(model) ?? normModel(rawModel));
    out.costUsd += (i * pi + o * po + cr * pi * 0.1 + cw * pi * 1.25) / 1e6;
  }
  const last = [...usageById.values()].pop()?.u;
  if (last) out.contextUsed = (last.input_tokens ?? 0) + (last.cache_read_input_tokens ?? 0) + (last.cache_creation_input_tokens ?? 0);
  out.costUsd = Math.round(out.costUsd * 10000) / 10000;
  out.longContext = /\[1m\]/i.test(rawModel ?? "");
  out.model = normModel(rawModel);
  out.riverScore = (raw.match(RIVER_RE) ?? []).length;
  return out;
}

// cache parsed files by path + size + mtime (big live transcripts only re-parse when they change)
const cache = new Map<string, { key: string; parsed: ParsedTranscript | null }>();
function parseCached(path: string): ParsedTranscript | null {
  let key: string;
  try { const s = statSync(path); key = `${s.size}:${s.mtimeMs}`; } catch { return null; }
  const hit = cache.get(path);
  if (hit && hit.key === key) return hit.parsed;
  const parsed = parseTranscript(path);
  cache.set(path, { key, parsed });
  return parsed;
}

function walk(dir: string, acc: string[] = [], depth = 0): string[] {
  if (depth > 5) return acc;
  let ents: import("node:fs").Dirent[] = [];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc, depth + 1);
    else if (e.isFile() && /^agent-.+\.jsonl$/.test(e.name)) acc.push(p);
  }
  return acc;
}

export function historySources(projectsRoot = join(homedir(), ".claude", "projects")): string[] {
  try { return readdirSync(projectsRoot).filter((d) => d.includes("OYIHack")).map((d) => join(projectsRoot, d)); } catch { return []; }
}

export function todayNoon(now = Date.now()): number { const d = new Date(now); d.setHours(12, 0, 0, 0); return d.getTime(); }

/** Scan every OYIHack transcript dir and return today's sessions (≥3 records, active after local noon) with subagents. */
export function importHistory(opts: { since?: number; minRecords?: number; projectsRoot?: string } = {}): { sessions: ParsedSession[]; sources: string[] } {
  const since = opts.since ?? todayNoon();
  const minRecords = opts.minRecords ?? 3;
  const sources = historySources(opts.projectsRoot);
  const sessions: ParsedSession[] = [];
  for (const dir of sources) {
    let files: string[] = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const path = join(dir, f);
      const p = parseCached(path);
      if (!p || p.records < minRecords || p.endedAt < since) continue;
      const sessionId = basename(f, ".jsonl");
      const subagents: ParsedSubagent[] = [];
      const subRoot = join(dir, sessionId, "subagents");
      if (existsSync(subRoot)) for (const ap of walk(subRoot)) {
        const sp = parseCached(ap);
        if (!sp || sp.records < 2 || sp.endedAt < since) continue;
        const agentId = basename(ap, ".jsonl").replace(/^agent-/, "");
        let meta: any = {};
        try { meta = JSON.parse(readFileSync(join(dirname(ap), `agent-${agentId}.meta.json`), "utf8")); } catch {}
        subagents.push({ ...sp, agentId, agentType: meta.agentType, description: meta.description });
      }
      sessions.push({ ...p, sessionId, dir, subagents });
    }
  }
  return { sessions, sources };
}

// ---------- River Sentinel outputs (parsed from the real files in the repo) ----------
export interface RiverOutputs { outputs: { label: string; value: string; source?: string }[]; checkpoints: { step: number; valAcc?: number; inference?: string }[]; baseModel?: string; baseAcc?: number; fastClf?: any; trainedAcc?: number }

const pct = (x: unknown) => (typeof x === "number" ? x.toFixed(3) : "?");
function readJson(path: string): any { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; } }

export function riverOutputs(repoRoot: string): RiverOutputs {
  const dir = join(repoRoot, "app", "river");
  const ev = readJson(join(dir, "eval.json"));
  const card = readJson(join(dir, "card.json"));
  const ck = readJson(join(dir, "checkpoint.json"));
  let status = ""; try { status = readFileSync(join(dir, "STATUS.md"), "utf8"); } catch {}
  const outputs: RiverOutputs["outputs"] = [];
  const tr = ev?.trained?.uncalibrated ?? ev?.trained?.calibrated;
  const bs = ev?.base?.uncalibrated ?? ev?.base?.calibrated;
  const n = ev?.trained?.n ?? card?.eval?.n;
  const trAcc = tr?.mean?.acc ?? card?.eval?.trained?.mean?.acc;
  const bsAcc = bs?.mean?.acc ?? card?.eval?.base?.mean?.acc;
  if (trAcc != null) outputs.push({ label: "Unseen accuracy", value: `${pct(bsAcc)} → ${pct(trAcc)} (base → trained${n ? `, n=${n}` : ""})`, source: "app/river/eval.json" });
  const ex5t = tr?.exact_all5 ?? card?.eval?.exact_all5?.trained, ex5b = bs?.exact_all5 ?? card?.eval?.exact_all5?.base;
  if (ex5t != null) outputs.push({ label: "All 5 fields right", value: `${pct(ex5b)} → ${pct(ex5t)} (base → trained)`, source: "app/river/eval.json" });
  const lat = ev?.trained?.latency ?? card?.latency?.trained;
  if (lat?.p50_ms != null) outputs.push({ label: "p50 / p95 latency", value: `${lat.p50_ms} / ${lat.p95_ms} ms${lat.batch ? ` (${lat.batch})` : ""}`, source: "app/river/eval.json" });
  const blat = ev?.base?.latency ?? card?.latency?.base;
  if (blat?.p50_ms != null) outputs.push({ label: "Base p50 / p95", value: `${blat.p50_ms} / ${blat.p95_ms} ms`, source: "app/river/eval.json" });
  if (tr) {
    const f = (k: string) => (tr[k]?.acc != null ? `${k.replace("human_only", "human")} ${pct(tr[k].acc)}` : "");
    const v = ["kind", "quadrant", "human_only", "department", "tier"].map(f).filter(Boolean).join(" · ");
    if (v) outputs.push({ label: "Per-field (unseen)", value: v, source: "app/river/eval.json" });
    if (tr.mean?.ece != null) outputs.push({ label: "Calibration (ECE)", value: `${pct(bs?.mean?.ece)} → ${pct(tr.mean.ece)}`, source: "app/river/eval.json" });
  }
  const baseModel = card?.base_model ?? ev?.base_model ?? ck?.base;
  if (baseModel) outputs.push({ label: "Base model", value: String(baseModel), source: "app/river/card.json" });
  const ckpt = card?.checkpoint ?? ck?.best?.inference ?? ev?.trained?.checkpoint;
  if (ckpt) outputs.push({ label: "Checkpoint", value: String(ckpt), source: "app/river/card.json" });
  const steps = card?.best_step ?? ck?.best?.step;
  const rank = card?.lora?.rank ?? ck?.rank;
  const cost = status.match(/\*\*~?\$([\d.]+)\*\*/)?.[1];
  const exs = card?.dataset?.training_examples;
  const parts = [steps != null ? `${steps} SFT steps` : "", rank != null ? `LoRA r${rank}` : "", exs ? `${exs} examples` : "", cost ? `~$${cost}` : ""].filter(Boolean);
  if (parts.length) outputs.push({ label: "Training", value: parts.join(" · "), source: "app/river/card.json" });
  if (ck?.best?.val_acc != null) outputs.push({ label: "Best val accuracy", value: `${pct(ck.best.val_acc)} @ step ${ck.best.step}`, source: "app/river/checkpoint.json" });
  const cpk = ev?.trained?.cost_per_1k_decisions_usd ?? card?.cost_per_1k_decisions_usd;
  if (cpk != null) outputs.push({ label: "Serving cost", value: `$${cpk} / 1k decisions`, source: "app/river/eval.json" });
  const checkpoints = (Array.isArray(ck?.checkpoints) ? ck.checkpoints : []).map((c: any) => ({ step: Number(c.step), valAcc: c.val_acc, inference: c.inference }));
  return { outputs, checkpoints, baseModel, baseAcc: bsAcc, trainedAcc: trAcc, fastClf: card?.eval?.fast_clf };
}
