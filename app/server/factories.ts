// S4: factories — recurring agent runs (paused by default, "Run now" spawns through Superset).
import type { CommandResult, DeptId, Factory } from "../shared/types";
import type { Ctx } from "./plugin";
import { spawnUnit } from "./superset";

const DAY = 86_400_000;
const EST_RUN_USD = 0.5; // prior until a factory run has been measured
const runSpawns = new Map<string, string[]>(); // factory id → spawned workspace ids / names
let seq = 0;

function make(ctx: Ctx, planetId: DeptId, label: string, prompt: string, cadenceMs: number, paused = true): Factory {
  const f: Factory = { id: `fac-${++seq}-${Math.random().toString(36).slice(2, 6)}`, planetId, label, prompt, cadenceMs, nextRunAt: Date.now() + cadenceMs,
    paused, runs: 0, outputsPerDay: 0, creditsPerDay: 0, pos: { x: 0, y: 0 } };
  recompute(ctx, f);
  return f;
}

function recompute(ctx: Ctx, f: Factory) {
  f.outputsPerDay = Math.round((DAY / Math.max(60_000, f.cadenceMs)) * 100) / 100;
  const ids = runSpawns.get(f.id) ?? [];
  const costs = ids.map((w) => [...ctx.world.units.values()].filter((u) => u.workspaceId === w).reduce((s, u) => s + u.costUsd, 0)).filter((c) => c > 0);
  const avg = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : EST_RUN_USD;
  f.creditsPerDay = Math.round(avg * f.outputsPerDay * 100) / 100;
}

export function seedFactories(ctx: Ctx) {
  if (ctx.world.factories.length) return;
  ctx.world.factories.push(
    make(ctx, "engineering", "Nightly GBrain PR triage",
      "Triage GBrain's 10 oldest open PRs (read-only): for each give a verdict, risk and next step. Remember the triage table in GBrain under company/engineering/gbrain-pr-triage/<date> with provenance.", DAY),
    make(ctx, "product_design", "Sprint retro (GBrain skill)",
      "Run the sprint-retro GBrain skill: recall this week's company/* pages, write what shipped, what blocked us and what to change, and remember it under company/product-design/retros/<date>.", 7 * DAY),
  );
}

async function runFactory(ctx: Ctx, f: Factory, scheduled = false): Promise<CommandResult> {
  const r = await spawnUnit(ctx, { planetId: f.planetId, prompt: f.prompt, tier: "sonnet", name: f.label });
  f.nextRunAt = Date.now() + f.cadenceMs;
  if (!r.ok || !r.spawn) { f.lastOutput = r.message; return { ok: false, message: `${f.label}: ${r.message}` }; }
  f.runs++;
  f.lastOutput = `${scheduled ? "Scheduled" : "Manual"} run → ${r.spawn.name} at ${new Date().toLocaleTimeString()}`;
  const list = runSpawns.get(f.id) ?? []; list.push(r.spawn.workspaceId ?? r.spawn.name); runSpawns.set(f.id, list);
  ctx.world.log(`⚙ Factory “${f.label}” run #${f.runs} → ${r.spawn.name}`);
  recompute(ctx, f);
  return { ok: true, message: `Factory “${f.label}” launched ${r.spawn.name}` };
}

export async function handleFactoryCommand(cmd: any, ctx: Ctx): Promise<CommandResult | undefined> {
  switch (cmd.type) {
    case "build_factory": {
      if (!cmd.prompt || !cmd.planetId) return { ok: false, message: "Factory needs a planet and a prompt" };
      const f = make(ctx, cmd.planetId, cmd.label || "Factory", cmd.prompt, Number(cmd.cadenceMs) || DAY, true);
      ctx.world.factories.push(f);
      ctx.world.log(`⚙ Built factory “${f.label}” (paused)`);
      return { ok: true, message: `Built factory “${f.label}” (paused; Run now or unpause)`, data: { id: f.id } };
    }
    case "factory_toggle": {
      const f = ctx.world.factories.find((x) => x.id === cmd.factoryId); if (!f) return { ok: false, message: "Factory not found" };
      f.paused = !!cmd.paused; if (!f.paused) f.nextRunAt = Math.max(f.nextRunAt, Date.now() + 5_000);
      return { ok: true, message: `Factory “${f.label}” ${f.paused ? "paused" : "running"}` };
    }
    case "factory_run": {
      const f = ctx.world.factories.find((x) => x.id === cmd.factoryId); if (!f) return { ok: false, message: "Factory not found" };
      return runFactory(ctx, f);
    }
  }
  return undefined;
}

let lastTick = 0;
const inflight = new Set<string>();
export function factoriesTick(ctx: Ctx, now = Date.now()) {
  if (now - lastTick < 2_000) return; lastTick = now;
  for (const f of ctx.world.factories) {
    recompute(ctx, f);
    if (f.paused || now < f.nextRunAt || inflight.has(f.id)) continue;
    inflight.add(f.id);
    void runFactory(ctx, f, true).finally(() => inflight.delete(f.id));
  }
}
