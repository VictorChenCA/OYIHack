// S3 Brains: summaries, blocker classification, ranking, autonomy, commander, strategy advice.
// All LLM calls go through server/llm.ts (headless Claude Code on the subscription; hooks + MCP disabled).
import type { Enemy, Unit } from "../../shared/types";
import type { Ctx, Plugin } from "../plugin";
import { detectNewEnemies, reclassifyAll } from "../classify";
import { heuristic, candidates, rank } from "../rank";
import { runCommander, refreshAdvice } from "../commander";
import { periodicSummaries, summarize } from "../summaries";
import { stats } from "../llm";
import { overviewTick } from "../overview";

let lastSummaryTick = 0, lastAutonomy = 0, lastAdvice = 0;
const startedAt = Date.now();
const ADVICE_EVERY = 5 * 60_000;
const autoTried = new Map<string, number>(); // enemyId → last auto-attack attempt

function eligible(u: Unit, ctx: Ctx): boolean {
  if (ctx.world.autonomy === "auto") return true;
  return u.groups.some((g) => ctx.world.stances[g] === "auto_attack");
}

async function autonomyPass(ctx: Ctx) {
  const w = ctx.world;
  const anyStance = Object.values(w.stances).includes("auto_attack");
  if (w.autonomy !== "auto" && !anyStance) return;
  const now = Date.now();
  const used = new Set<string>();
  const enemies = [...w.enemies.values()].filter((e: Enemy) => !e.resolved && !e.humanOnly && e.attackers.length === 0 && e.blocked.length > 0)
    .sort((a, b) => b.blocked.length - a.blocked.length);
  for (const e of enemies) {
    if (now - (autoTried.get(e.id) ?? 0) < 60_000) continue;
    const pool = candidates(ctx, e).filter((u) => !used.has(u.id) && !u.attacking && u.role === "mothership" && eligible(u, ctx));
    if (!pool.length) continue;
    const best = pool.map((u) => heuristic(u, e, ctx)).sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 20) continue;
    autoTried.set(e.id, now); used.add(best.unitId);
    const u = w.units.get(best.unitId)!;
    const r = await ctx.command({ type: "attack", enemyId: e.id, unitIds: [best.unitId] });
    w.log(`⚙ Auto: ${u.label} → “${e.title}” (score ${best.score}: ${best.reason})${r.ok ? "" : ` ✗ ${r.message}`}`, { unitId: u.id, enemyId: e.id });
  }
}

const plugin: Plugin = {
  name: "brains",
  init(ctx) {
    console.log(`[brains] ready · sentinel ${ctx.cfg.sentinelUrl} · engine ${ctx.world.research.engine}`);
    lastAdvice = startedAt - ADVICE_EVERY + 30_000; // first advice ~30s after startup
  },
  routes: {
    "GET /api/rank/": (_req, url, ctx) => {
      const id = decodeURIComponent(url.pathname.slice("/api/rank/".length));
      return Response.json(rank(ctx, id));
    },
    "GET /api/brains/stats": () => Response.json({ calls: stats.calls, failures: stats.failures, cacheHits: stats.cacheHits, lastLatencyMs: stats.lastLatencyMs, active: stats.active(), queued: stats.queued() }),
  },
  onHook(ev, ctx) {
    if (ev.hook_event_name === "Stop" || ev.hook_event_name === "SubagentStop") {
      const id = ev.hook_event_name === "SubagentStop" && ev.agent_id ? `${ev.session_id}:${ev.agent_id}` : ev.session_id;
      const u = ctx.world.units.get(id) ?? ctx.world.units.get(ev.session_id);
      if (u) summarize(u, ctx, ev.hook_event_name);
    } else if (ev.hook_event_name === "UserPromptSubmit" && ev._simulated) {
      const u = ctx.world.units.get(ev.session_id); if (u) summarize(u, ctx, "prompt");
    }
    detectNewEnemies(ctx);
  },
  onTick(ctx) {
    const now = Date.now();
    detectNewEnemies(ctx);
    if (now - lastSummaryTick > 5000) { lastSummaryTick = now; periodicSummaries(ctx); overviewTick(ctx); }
    if (now - lastAutonomy > 5000) { lastAutonomy = now; void autonomyPass(ctx).catch((e) => console.warn(`[brains] autonomy: ${e?.message ?? e}`)); }
    if (now - lastAdvice > ADVICE_EVERY) { lastAdvice = now; void refreshAdvice(ctx).catch((e) => console.warn(`[brains] advice: ${e?.message ?? e}`)); }
  },
  onCommand(cmd, ctx) {
    if (cmd.type === "commander") {
      if (!cmd.text?.trim()) return { ok: false, message: "Empty order" };
      void runCommander(cmd.text.trim(), ctx);
      return { ok: true, message: "" };
    }
    if (cmd.type === "research_engine") {
      // re-classify live enemies under the newly selected engine (research slice owns the engine switch itself)
      setTimeout(() => reclassifyAll(ctx), 200);
    }
    return undefined;
  },
};
export default plugin;
