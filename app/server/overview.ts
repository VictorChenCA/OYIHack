// Company overview + per-department one-liners ("summarized before you click"). One Haiku call every ~75s;
// a computed sentence fills in instantly (and whenever the LLM is slow or unavailable).
import type { Ctx } from "./plugin";
import { claudeJson } from "./llm";
import { digest } from "./commander";

let last = 0, inFlight = false, llmAt = 0;
const EVERY = 75_000;

function computed(ctx: Ctx) {
  const w = ctx.world; const units = [...w.units.values()].filter((u) => u.status !== "dead");
  const working = units.filter((u) => ["working", "acting", "attacking"].includes(u.status)).length;
  const blockers = [...w.enemies.values()].filter((e) => !e.resolved);
  const needYou = blockers.filter((e) => e.humanOnly).length;
  const depts = w.planets.filter((p) => units.some((u) => u.planetId === p.id)).length;
  const parts = [`${working} agent${working === 1 ? "" : "s"} working across ${depts} team${depts === 1 ? "" : "s"}`];
  if (blockers.length) parts.push(`${blockers.length} blocker${blockers.length === 1 ? "" : "s"}${needYou ? ` (${needYou} need you)` : ""}`);
  else parts.push("no blockers");
  const facts = w.knowledge.recent.filter((m) => m.kind === "write" && Date.now() - m.at < 15 * 60_000).length;
  if (facts) parts.push(`${facts} memories written in the last 15 min`);
  return parts.join(" · ");
}
function computedPlanet(ctx: Ctx, id: string) {
  const w = ctx.world; const us = [...w.units.values()].filter((u) => u.planetId === id && u.status !== "dead" && u.role === "mothership");
  if (!us.length) return "No agents yet";
  const bl = [...w.enemies.values()].filter((e) => !e.resolved && e.planetIds.includes(id as any)).length;
  const top = us.find((u) => u.task)?.task;
  return `${us.length} agent${us.length === 1 ? "" : "s"}${bl ? ` · ${bl} blocker${bl === 1 ? "" : "s"}` : ""}${top ? ` · ${top.slice(0, 60)}` : ""}`;
}

export function overviewTick(ctx: Ctx) {
  const w = ctx.world;
  // computed lines stay live every tick unless a fresh AI summary exists
  if (Date.now() - llmAt > EVERY) { w.overview = computed(ctx); for (const p of w.planets) p.summary = computedPlanet(ctx, p.id); }
  if (inFlight || Date.now() - last < EVERY) return;
  const real = [...w.units.values()].some((u) => !u.simulated && u.status !== "dead");
  if (!real) { last = Date.now(); w.overview = computed(ctx); for (const p of w.planets) p.summary = computedPlanet(ctx, p.id); return; }
  inFlight = true; last = Date.now();
  const prompt = `You write the status line of an ops console for a founder running a company of AI agents. Use ONLY facts in the world state below; no invented problems. Plain words: teams, agents, blockers, credits. Never say planets, units, enemies, gold, mines. It is a founder tool, not a game.
Return strict JSON: {"overview": "<=28 words: what the company is doing right now and what needs the founder", "planets": {"engineering": "<=14 words", "product": "...", "design": "...", "marketing": "...", "operations": "..."}}
Teams with no agents: "No agents yet".

WORLD STATE:
${digest(ctx, 30)}`;
  claudeJson<{ overview?: string; planets?: Record<string, string> }>(prompt, { model: "haiku", timeoutMs: 60_000 })
    .then((j) => {
      if (j?.overview) { w.overview = j.overview.trim(); llmAt = Date.now(); }
      if (j?.planets) for (const p of w.planets) if (j.planets[p.id]) p.summary = j.planets[p.id].trim();
    })
    .catch((e) => console.warn(`[overview] ${e?.message ?? e}`))
    .finally(() => { inFlight = false; });
}
