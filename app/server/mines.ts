// S4: resource mines. claude = subscription usage priced at API rates; river = credits; gbrain = manual.
import { existsSync, readFileSync, statSync } from "node:fs";
import type { Ctx } from "./plugin";

const APP = new URL("../", import.meta.url).pathname;
const seenCost = new Map<string, number>(); // unit id → max cost seen this session (units get deleted when dead)
const samples: { t: number; spent: number }[] = [];
let riverCache: { mtime: number; spend?: number } = { mtime: -1 };

function riverSpend(ctx: Ctx): number {
  const p = `${APP}river/STATUS.md`;
  try {
    if (existsSync(p)) {
      const mt = statSync(p).mtimeMs;
      if (mt !== riverCache.mtime) {
        const m = readFileSync(p, "utf8").match(/spend[^\n$\d]*\$?\s*([\d,]+(?:\.\d+)?)/i);
        riverCache = { mtime: mt, spend: m ? Number(m[1].replace(/,/g, "")) : undefined };
      }
      if (riverCache.spend !== undefined) return riverCache.spend;
    }
  } catch {}
  return ctx.world.research.runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
}

const firstCost = new Map<string, number>(); // cost when first observed (pre-existing spend is not "burn")

export function updateMines(ctx: Ctx, now = Date.now()) {
  for (const u of ctx.world.units.values()) {
    if (u.simulated || !(u.costUsd > 0)) continue;
    if (!firstCost.has(u.id)) firstCost.set(u.id, u.costUsd);
    if (u.costUsd > (seenCost.get(u.id) ?? 0)) seenCost.set(u.id, u.costUsd);
  }
  let spent = 0, burned = 0;
  for (const [id, v] of seenCost) { spent += v; burned += v - (firstCost.get(id) ?? v); }
  samples.push({ t: now, spent: burned });
  while (samples.length > 2 && now - samples[1].t > 15 * 60_000) samples.shift();
  const first = samples[0];
  const dt = now - first.t;
  const burn = dt > 20_000 ? ((burned - first.spent) / dt) * 86_400_000 : 0;
  for (const m of ctx.world.mines) {
    if (m.id === "claude") {
      m.remaining = Math.max(0, Math.round((m.total - spent) * 100) / 100);
      m.burnPerDay = Math.round(burn * 100) / 100;
      m.measured = true;
      if (!/API rates/.test(m.label)) m.label = `${m.label.replace(/\s*\(.*\)$/, "")} (subscription usage at API rates)`;
    } else if (m.id === "river") {
      const s = riverSpend(ctx);
      m.remaining = Math.max(0, Math.round((m.total - s) * 100) / 100);
      m.measured = s > 0 || m.measured;
    }
  }
}
