// S3 Brains: rank units for an enemy. Instant heuristic (0..100), then ONE Haiku call refines the top ≤10.
import type { Enemy, RankEntry, Tier, Unit } from "../shared/types";
import type { Ctx } from "./plugin";
import { claudeJson } from "./llm";
import { defaultTier } from "./classify";

const TIER_ORDER: Tier[] = ["haiku", "sonnet", "opus", "fable"];

export function candidates(ctx: Ctx, e: Enemy): Unit[] {
  return [...ctx.world.units.values()].filter((u) =>
    u.role !== "subagent" && u.status !== "dead" && u.status !== "done" && !u.blockedBy && !e.blocked.includes(u.id) &&
    (!u.attacking || u.attacking === e.id || u.status === "idle"));
}

export function heuristic(u: Unit, e: Enemy, ctx: Ctx): RankEntry {
  if (e.humanOnly) return { unitId: u.id, score: Math.min(10, u.status === "idle" ? 10 : 5), reason: "human-only" };
  let s = 35; const why: string[] = [];
  if (e.planetIds.includes(u.planetId)) { s += 20; why.push("same dept"); }
  const blockedProjects = new Set(e.blocked.map((id) => ctx.world.units.get(id)?.projectId).filter(Boolean));
  if (blockedProjects.has(u.projectId)) { s += 10; why.push("same project"); }
  if (u.status === "idle") { s += 15; why.push("idle"); }
  if (u.attacking === e.id) { s += 5; why.push("already on it"); }
  const want = e.classification?.tier.label ?? defaultTier(e.kind, e.title);
  if (u.tier === want) { s += 15; why.push(`${want} fits`); }
  else if (TIER_ORDER.indexOf(u.tier) > TIER_ORDER.indexOf(want) && TIER_ORDER.indexOf(want) >= 0) { s += 7; why.push("overqualified"); }
  const ctxUse = u.contextWindow ? u.contextUsed / u.contextWindow : 0;
  if (ctxUse > 0.5) { s -= Math.round(ctxUse * 25); why.push(`${Math.round(ctxUse * 100)}% context`); }
  if (u.failCount) { s -= Math.min(15, u.failCount * 5); why.push(`${u.failCount} fails`); }
  if (u.role === "subagent") s -= 10;
  return { unitId: u.id, score: Math.max(0, Math.min(100, Math.round(s))), reason: why.slice(0, 3).join(", ") || "available" };
}

export function heuristicRank(ctx: Ctx, e: Enemy): RankEntry[] {
  return candidates(ctx, e).map((u) => heuristic(u, e, ctx)).sort((a, b) => b.score - a.score);
}

const cache = new Map<string, RankEntry[]>();
const refining = new Set<string>();
const keyOf = (ctx: Ctx, e: Enemy, ids: string[]) =>
  `${e.id}|${e.classification?.source ?? ""}|` + ids.map((id) => { const u = ctx.world.units.get(id); return `${id}@${(u?.simulated ? u.task : u?.summary) ?? ""}`; }).join(",");

/** Heuristic now (or cached refined), refine in the background and broadcast {type:'rank'}. */
export function rank(ctx: Ctx, enemyId: string): RankEntry[] {
  const e = ctx.world.enemies.get(enemyId); if (!e) return [];
  const base = heuristicRank(ctx, e);
  if (e.humanOnly || !base.length) return base;
  const top = base.slice(0, 10);
  const key = keyOf(ctx, e, top.map((r) => r.unitId).sort());
  const hit = cache.get(key);
  if (hit) return mergeRefined(base, hit);
  const anyReal = top.some((r) => !ctx.world.units.get(r.unitId)?.simulated);
  if (!refining.has(key) && (anyReal || !e.simulated)) void refine(ctx, e, top, base, key);
  return base;
}

function mergeRefined(base: RankEntry[], refined: RankEntry[]): RankEntry[] {
  const m = new Map(refined.map((r) => [r.unitId, r]));
  return base.map((b) => m.get(b.unitId) ?? { ...b, score: Math.min(b.score, 40) }).sort((a, b) => b.score - a.score);
}

async function refine(ctx: Ctx, e: Enemy, top: RankEntry[], base: RankEntry[], key: string) {
  refining.add(key);
  try {
    const lines = top.map((r) => {
      const u = ctx.world.units.get(r.unitId)!;
      return `- id=${u.id} label=${u.label} dept=${u.planetId} project=${u.projectId} tier=${u.tier} status=${u.status} heuristic=${r.score}${u.summary ? ` summary="${u.summary}"` : u.task ? ` task="${u.task}"` : ""}`;
    }).join("\n");
    const prompt = `You pick which AI agent (unit) should be sent to clear a blocker in an agent command center.
Blocker: "${e.title}": ${e.reason} (kind=${e.kind}, quadrant=${e.quadrant}, depts=${e.planetIds.join(",")}${e.classification ? `, best tier=${e.classification.tier.label}` : ""})
Candidates:
${lines}

Score each candidate 0-100 for fit (relevant context from its summary, same dept/project, right tier, free capacity). Reply ONLY strict JSON:
{"entries":[{"unitId":"<id>","score":0-100,"reason":"<=12 words"}]}`;
    const j: any = await claudeJson(prompt, { model: "haiku", timeoutMs: 45_000 });
    const ids = new Set(top.map((r) => r.unitId));
    const entries: RankEntry[] = (j?.entries ?? []).filter((x: any) => ids.has(x?.unitId)).map((x: any) => ({
      unitId: x.unitId, score: Math.max(0, Math.min(100, Math.round(Number(x.score) || 0))), reason: String(x.reason ?? "").split(/\s+/).slice(0, 12).join(" "),
    }));
    if (!entries.length) return;
    cache.set(key, entries); if (cache.size > 200) cache.delete(cache.keys().next().value!);
    if (ctx.world.enemies.has(e.id)) ctx.broadcast({ type: "rank", enemyId: e.id, entries: mergeRefined(base, entries) });
  } finally { refining.delete(key); }
}
