// S3 Brains: ≤25-word present-tense summaries of what each unit is trying to do (Haiku over the transcript tail).
// Simulated units get a template summary (no LLM). Max 1 in flight per unit, max 4 overall.
import type { Unit } from "../shared/types";
import type { Ctx } from "./plugin";
import { claude } from "./llm";
import { readTail, tailDigest } from "./transcript-tail";

const inflight = new Set<string>();
const MAX_INFLIGHT = 4;
const PERIODIC_MS = 90_000;
const lastSig = new Map<string, string>(); // unit → input signature (skip unchanged)

const clean = (s: string) => s.replace(/^["'`\s]+|["'`\s]+$/g, "").replace(/^summary:\s*/i, "").replace(/\s+/g, " ").split(" ").slice(0, 30).join(" ");

export function templateSummary(u: Unit): string {
  const task = u.task ? u.task.replace(/\s+/g, " ").slice(0, 90) : u.agentType ? `${u.agentType} subtask` : "awaiting orders";
  const tool = u.lastTool ? `; last ran ${u.lastTool}${u.lastToolInput ? ` on ${u.lastToolInput.slice(0, 40)}` : ""}` : "";
  const st = u.status === "blocked" ? "Blocked while working on" : u.status === "idle" ? "Idle after" : "Working on";
  return `${st}: ${task}${tool}.`;
}

export function summarize(u: Unit, ctx: Ctx, why: string): void {
  if (u.status === "dead") return;
  if (u.simulated || !u.transcriptPath) {
    if (u.simulated || u.task || u.lastTool) ctx.world.setSummary(u.id, templateSummary(u));
    return;
  }
  if (inflight.has(u.id) || inflight.size >= MAX_INFLIGHT) return;
  const tail = readTail(u.transcriptPath, 60);
  if (!tail || !tail.items.length) { if (u.task) ctx.world.setSummary(u.id, templateSummary(u)); return; }
  const digest = tailDigest(tail, 5000);
  const sig = `${tail.items.length}:${digest.slice(-300)}`;
  if (lastSig.get(u.id) === sig && u.summary) return;
  lastSig.set(u.id, sig);
  inflight.add(u.id);
  const prompt = `You are watching a Claude Code agent's session transcript (most recent at the bottom).
In at most 25 words, present tense, state what the agent is trying to do right now and the key context it has (files, services, blockers).
No preamble, no quotes, one sentence.

Agent label: ${u.label}${u.task ? `\nCurrent task: ${u.task}` : ""}
Transcript tail:
${digest}`;
  claude(prompt, { model: "haiku", timeoutMs: 45_000 })
    .then((text) => { const s = clean(text); if (s) ctx.world.setSummary(u.id, s); })
    .catch((e) => { console.warn(`[brains] summary ${u.label} (${why}): ${String(e?.message ?? e).slice(0, 120)}`); if (!u.summary) ctx.world.setSummary(u.id, templateSummary(u)); })
    .finally(() => inflight.delete(u.id));
}

/** Called from onTick (throttled by the caller): refresh working units every 90s. */
export function periodicSummaries(ctx: Ctx) {
  const now = Date.now();
  for (const u of ctx.world.units.values()) {
    if (u.status === "dead" || u.status === "done") continue;
    const stale = !u.summary || !u.summaryAt || now - u.summaryAt > PERIODIC_MS; // subagents inherit summaryAt from the mothership
    if (!stale) continue;
    if (u.simulated) { summarize(u, ctx, "tick"); continue; }
    if (u.status === "working" || u.status === "acting" || u.status === "attacking" || !u.summary) summarize(u, ctx, "tick");
  }
}
