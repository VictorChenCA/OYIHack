// S4: resource mines. claude = subscription usage priced at API rates; river = credits; gbrain = manual.
import { existsSync, readFileSync, statSync } from "node:fs";
import type { Ctx } from "./plugin";
import { fileCosts } from "./transcripts";

const APP = new URL("../", import.meta.url).pathname;
const seenCost = new Map<string, number>(); // transcript path → max cost seen this session
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
  // keyed by transcript file (motherships + all their subagent transcripts)
  const costs = fileCosts();
  for (const [k, c] of costs) {
    if (!firstCost.has(k)) firstCost.set(k, c);
    if (c > (seenCost.get(k) ?? 0)) seenCost.set(k, c);
  }
  let burned = 0;
  for (const [id, v] of seenCost) burned += v - (firstCost.get(id) ?? v);
  samples.push({ t: now, spent: burned });
  while (samples.length > 2 && now - samples[1].t > 15 * 60_000) samples.shift();
  const first = samples[0];
  const dt = now - first.t;
  const burn = dt > 20_000 ? ((burned - first.spent) / dt) * 86_400_000 : 0;
  for (const m of ctx.world.mines) {
    if (m.id === "claude") {
      m.remaining = Math.max(0, Math.round((m.total - burned) * 100) / 100); // spend since C&C started watching (pre-existing session cost isn't burn)
      m.burnPerDay = Math.round(burn * 100) / 100;
      m.measured = true;
    } else if (m.id === "river") {
      const s = riverSpend(ctx);
      m.remaining = Math.max(0, Math.round((m.total - s) * 100) / 100);
      m.measured = s > 0 || m.measured;
    }
  }
}
