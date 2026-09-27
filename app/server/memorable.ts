// S4: Memorable — recall on UserPromptSubmit (charted lane + veteran badge), record on successful Stop (ingest trace).
import type { HookEvent } from "../shared/types";
import type { Ctx } from "./plugin";

const THRESHOLD = 0.55;

async function run(ctx: Ctx, args: string[], stdin?: string, timeoutMs = 3000): Promise<{ ok: boolean; out: string }> {
  try {
    const p = Bun.spawn(["memorable", ...args], { cwd: ctx.cfg.repoRoot, stdout: "pipe", stderr: "pipe", stdin: stdin !== undefined ? "pipe" : "ignore" });
    if (stdin !== undefined && p.stdin) { (p.stdin as any).write(stdin); (p.stdin as any).end(); }
    const timer = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
    const out = await new Response(p.stdout).text();
    const code = await p.exited; clearTimeout(timer);
    return { ok: code === 0, out };
  } catch { return { ok: false, out: "" }; }
}

const firstLine = (s: string) => (s.split("\n").find((l) => l.trim() && !l.startsWith("<")) ?? s).trim().slice(0, 200);

function bestHit(j: any): { name: string; score: number } | undefined {
  const rs: any[] = Array.isArray(j) ? j : j?.results ?? j?.procedures ?? [];
  let best: { name: string; score: number } | undefined;
  for (const r of rs) {
    const raw = r.score ?? r.similarity ?? r.confidence ?? r.relevance;
    const score = typeof raw === "number" ? raw : /exact|lexical/i.test(String(r.match ?? r.method ?? "")) ? 1 : 0.6;
    const name = String(r.goal ?? r.title ?? r.name ?? r.task_description ?? r.description ?? r.id ?? "procedure");
    if (!best || score > best.score) best = { name, score };
  }
  return best;
}

export async function recallFor(ctx: Ctx, unitId: string, prompt: string) {
  const q = firstLine(prompt); if (q.length < 4) return;
  const r = await run(ctx, ["recall", q, "--json"]);
  if (!r.ok) return;
  let j: any; try { j = JSON.parse(r.out); } catch { return; }
  const hit = bestHit(j);
  if (hit && hit.score >= THRESHOLD) {
    ctx.world.markCharted(unitId, true);
    const u = ctx.world.units.get(unitId);
    ctx.world.log(`${u?.label ?? "unit"} charted route: ${hit.name.slice(0, 70)}`, { unitId });
  }
}

// ---------- procedures counter (knowledge.procedures) ----------
let lastList = 0, listing = false;
export function memorableTick(ctx: Ctx, now = Date.now()) {
  if (listing || now - lastList < 30_000) return;
  listing = true; lastList = now;
  void run(ctx, ["list", "--json"], undefined, 5000).then((r) => {
    if (!r.ok) return;
    try { const j = JSON.parse(r.out); const list = Array.isArray(j) ? j : j?.procedures ?? j?.results ?? []; ctx.world.knowledge.procedures = list.length; } catch {}
  }).finally(() => { listing = false; });
}

// ---------- record: trace from the hook stream → `memorable ingest -` ----------
interface Step { name: string; input: { command: string }; result?: { ok: boolean } }
const traces = new Map<string, { task: string; steps: Step[]; byUse: Map<string, Step> }>();
const ident = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 160);

function stepFor(ev: HookEvent): Step {
  const i: any = ev.tool_input ?? {};
  const tool = ev.tool_name ?? "Tool";
  const cmd = tool === "Bash" ? ident(String(i.command ?? "")) : `${tool}${i.file_path ? ` file_path=${i.file_path}` : i.pattern ? ` pattern=${ident(String(i.pattern))}` : i.url ? ` url=${i.url}` : i.slug ? ` slug=${i.slug}` : ""}`;
  return { name: tool, input: { command: cmd || tool } };
}

export function memorableOnHook(ev: HookEvent, ctx: Ctx) {
  if (ev._simulated || ev.agent_id) return;
  const u = ctx.world.units.get(ev.session_id);
  if (!u || u.simulated) return;
  switch (ev.hook_event_name) {
    case "UserPromptSubmit":
      traces.set(u.id, { task: firstLine(ev.prompt ?? ""), steps: [], byUse: new Map() });
      void recallFor(ctx, u.id, ev.prompt ?? "");
      break;
    case "PreToolUse": {
      const t = traces.get(u.id); if (!t || t.steps.length > 200) break;
      const s = stepFor(ev); t.steps.push(s); if (ev.tool_use_id) t.byUse.set(ev.tool_use_id, s);
      break;
    }
    case "PostToolUse": case "PostToolUseFailure": {
      const s = ev.tool_use_id ? traces.get(u.id)?.byUse.get(ev.tool_use_id) : undefined;
      if (s) s.result = { ok: ev.hook_event_name === "PostToolUse" };
      break;
    }
    case "Stop": {
      const t = traces.get(u.id); traces.delete(u.id);
      if (!t || t.steps.length < 2 || !t.task || u.status === "blocked") break;
      const steps = t.steps.slice(); while (steps.length && !steps[steps.length - 1].result?.ok) steps.pop();
      if (steps.length < 2) break;
      const trace = { session_id: ev.session_id, harness: "cnc", task_description: t.task, tool_calls: steps };
      void run(ctx, ["ingest", "-"], JSON.stringify(trace), 20_000).then((r) => { if (r.ok) ctx.world.log(`◆ Memorable recorded a procedure: ${t.task.slice(0, 50)}`, { unitId: u.id }); });
      break;
    }
  }
}
