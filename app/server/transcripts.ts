// S4: Claude Code transcript reader — unit history (GET /api/unit/:id) and the usage/cost/context poller.
import { closeSync, existsSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HistoryItem, Tier, Unit, UnitDetail } from "../shared/types";
import type { Ctx } from "./plugin";
import { tierOf } from "./world";

// $/MTok (input, output)
function price(model: string): [number, number] {
  const m = model.toLowerCase();
  if (m.includes("opus-5-5")) return [4, 20];
  if (m.includes("opus")) return [5, 25];
  if (m.includes("fable")) return [10, 50];
  if (m.includes("sonnet")) return [2, 10];
  if (m.includes("haiku")) return [1, 5];
  return [2, 10];
}
export const cleanModel = (m: string) => m.replace(/\[1m\]/gi, "").replace(/-\d{8}$/, "").trim();

// ---------- transcript location ----------
const globCache = new Map<string, string>();
export function transcriptFor(u: Unit, units: Map<string, Unit>): string | undefined {
  if (u.transcriptPath && existsSync(u.transcriptPath) && u.role !== "subagent") return u.transcriptPath;
  if (u.role === "subagent") {
    if (u.transcriptPath && u.transcriptPath !== units.get(u.parentId ?? "")?.transcriptPath && existsSync(u.transcriptPath)) return u.transcriptPath;
    if (globCache.has(u.id)) return globCache.get(u.id);
    const mother = units.get(u.parentId ?? "");
    const mp = mother?.transcriptPath;
    if (!mp || !u.agentId) return undefined;
    const dir = join(dirname(mp), u.sessionId, "subagents");
    if (!existsSync(dir)) return undefined;
    try {
      for (const f of new Bun.Glob(`**/agent-${u.agentId}.jsonl`).scanSync({ cwd: dir, absolute: true })) { globCache.set(u.id, f); return f; }
    } catch {}
    return undefined;
  }
  return u.transcriptPath;
}

function readTail(path: string, maxBytes = 6_000_000): string {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    let s = buf.toString("utf8");
    if (start > 0) s = s.slice(s.indexOf("\n") + 1);
    return s;
  } finally { closeSync(fd); }
}

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
function toolInputShort(name: string, input: any): string {
  if (!input || typeof input !== "object") return "";
  const v = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query ?? input.slug ?? input.description ?? input.prompt;
  return short(String(v ?? JSON.stringify(input)).replace(/\s+/g, " "), 160);
}
function resultText(c: any): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (b?.type === "text" ? b.text : b?.type === "image" ? "[image]" : "")).join(" ");
  return c ? JSON.stringify(c) : "";
}
const isNoise = (s: string) => /^\s*<(local-command|command-|system-reminder|bash-|task-notification)/.test(s) || s.startsWith("Caveat:");

export function unitDetail(ctx: Ctx, unitId: string): UnitDetail {
  const u = ctx.world.units.get(unitId);
  const empty: UnitDetail = { unitId, history: [], filesInContext: [], memoryInContext: [] };
  if (!u) return empty;
  const path = transcriptFor(u, ctx.world.units);
  if (!path || !existsSync(path)) {
    if (u.simulated) return { ...empty, history: [
      ...(u.task ? [{ ts: u.startedAt, role: "user" as const, kind: "prompt" as const, text: u.task }] : []),
      ...(u.lastTool ? [{ ts: u.lastEventAt, role: "tool" as const, kind: "tool_use" as const, text: u.lastToolInput ?? "", toolName: u.lastTool }] : []),
    ] };
    return empty;
  }
  const history: HistoryItem[] = [];
  const files: string[] = []; const mem: string[] = [];
  const pending = new Map<string, HistoryItem>();
  for (const line of readTail(path).split("\n")) {
    if (!line.trim()) continue;
    let r: any; try { r = JSON.parse(line); } catch { continue; }
    const ts = r.timestamp ? Date.parse(r.timestamp) : 0;
    const c = r.message?.content;
    if (r.type === "user" && !r.isMeta) {
      if (typeof c === "string") { if (!isNoise(c)) history.push({ ts, role: "user", kind: "prompt", text: short(c, 2000) }); }
      else if (Array.isArray(c)) {
        for (const b of c) {
          if (b?.type === "tool_result") {
            const t = short(resultText(b.content).replace(/\s+/g, " ").trim(), 240);
            const item: HistoryItem = { ts, role: "tool", kind: "tool_result", text: t, isError: !!b.is_error, toolName: pending.get(b.tool_use_id)?.toolName };
            history.push(item);
          } else if (b?.type === "text" && !isNoise(b.text ?? "")) history.push({ ts, role: "user", kind: "prompt", text: short(b.text, 2000) });
        }
      }
    } else if (r.type === "assistant" && Array.isArray(c)) {
      for (const b of c) {
        if (b?.type === "text" && b.text?.trim()) history.push({ ts, role: "assistant", kind: "text", text: short(b.text.trim(), 2000) });
        else if (b?.type === "tool_use") {
          const item: HistoryItem = { ts, role: "assistant", kind: "tool_use", text: toolInputShort(b.name, b.input), toolName: b.name };
          history.push(item); pending.set(b.id, item);
          const fp = b.input?.file_path ?? b.input?.notebook_path;
          if (fp && /^(Read|Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name)) { const i = files.indexOf(fp); if (i >= 0) files.splice(i, 1); files.push(fp); }
          if (/gbrain/i.test(b.name)) {
            const op = b.name.split("__").pop();
            const what = b.input?.slug ?? b.input?.query ?? b.input?.entity ?? b.input?.q ?? b.input?.title ?? "";
            const s = `${op}${what ? `: ${short(String(what), 80)}` : ""}`;
            const i = mem.indexOf(s); if (i >= 0) mem.splice(i, 1); mem.push(s);
          }
        }
      }
    }
  }
  return { unitId, history: history.slice(-200), filesInContext: files.slice(-40), memoryInContext: mem.slice(-30) };
}

// ---------- usage poller ----------
interface Usage { in: number; out: number; cr: number; cw: number; cost: number }
interface FileState { offset: number; rest: string; byId: Map<string, Usage>; model: string; oneM: boolean; ctx: number; tot: Usage }
const files = new Map<string, FileState>();
const zero = (): Usage => ({ in: 0, out: 0, cr: 0, cw: 0, cost: 0 });

function scan(path: string): FileState | undefined {
  let st = files.get(path);
  if (!st) files.set(path, (st = { offset: 0, rest: "", byId: new Map(), model: "", oneM: false, ctx: 0, tot: zero() }));
  let size: number; try { size = statSync(path).size; } catch { return undefined; }
  if (size < st.offset) { files.delete(path); return scan(path); }
  if (size === st.offset) return st;
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size - st.offset);
    readSync(fd, buf, 0, buf.length, st.offset);
    st.offset = size;
    const text = st.rest + buf.toString("utf8");
    const lines = text.split("\n"); st.rest = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.includes('"usage"')) continue;
      let r: any; try { r = JSON.parse(line); } catch { continue; }
      const m = r.message; if (r.type !== "assistant" || !m?.usage) continue;
      const raw = String(m.model ?? ""); if (raw === "<synthetic>") continue;
      if (raw) { st.model = cleanModel(raw); if (/\[1m\]/i.test(raw)) st.oneM = true; }
      const us = m.usage;
      const [pi, po] = price(st.model || raw);
      const u: Usage = { in: us.input_tokens ?? 0, out: us.output_tokens ?? 0, cr: us.cache_read_input_tokens ?? 0, cw: us.cache_creation_input_tokens ?? 0, cost: 0 };
      u.cost = (u.in * pi + u.out * po + u.cr * pi * 0.1 + u.cw * pi * 1.25) / 1e6;
      const id = m.id ?? r.uuid;
      const old = st.byId.get(id);
      if (old) for (const k of ["in", "out", "cr", "cw", "cost"] as const) st.tot[k] -= old[k];
      st.byId.set(id, u);
      for (const k of ["in", "out", "cr", "cw", "cost"] as const) st.tot[k] += u[k];
      st.ctx = u.in + u.cr + u.cw;
    }
  } finally { closeSync(fd); }
  return st;
}

export function pollUsage(ctx: Ctx, now = Date.now()) {
  for (const u of ctx.world.units.values()) {
    if (u.simulated || now - u.lastEventAt > 120_000) continue;
    const path = transcriptFor(u, ctx.world.units);
    if (!path || !existsSync(path)) continue;
    const st = scan(path); if (!st || !st.byId.size) continue;
    const tier: Tier = st.model ? tierOf(st.model) : u.tier;
    ctx.world.setUnitUsage(u.id, {
      tokens: { input: st.tot.in, output: st.tot.out, cacheRead: st.tot.cr, cacheWrite: st.tot.cw },
      costUsd: Math.round(st.tot.cost * 10000) / 10000,
      contextUsed: st.ctx,
      contextWindow: st.oneM || st.ctx > 200_000 ? 1_000_000 : 200_000,
      model: st.model || u.model,
      tier: tier === "unknown" ? u.tier : tier,
    });
  }
}
