// S4 Ops plugin: Superset (spawn/prompt/attack/deploy/resolve), transcripts (usage + /api/unit/:id), GBrain counts,
// Memorable recall/record, mines, factories and the Research Center server. Every piece degrades gracefully.
import type { Plugin } from "../plugin";
import { handleSupersetCommand, initSuperset, supersetOnHook, supersetReady } from "../superset";
import { pollUsage, unitDetail } from "../transcripts";
import { gbrainTick } from "../gbrain-counts";
import { memorableOnHook, memorableTick } from "../memorable";
import { updateMines } from "../mines";
import { factoriesTick, handleFactoryCommand, seedFactories } from "../factories";
import { handleResearchCommand, initResearch, researchTick } from "../research";

let lastUsage = 0, lastMines = 0;

const plugin: Plugin = {
  name: "ops",
  async init(ctx) {
    initSuperset(ctx);
    seedFactories(ctx);
    initResearch(ctx);
    void supersetReady().then((r) => console.log(`[ops] superset: ${r.ok ? "ready" : `not ready (${r.why})`}`));
  },
  routes: {
    "GET /api/unit/": (_req, url, ctx) => {
      const id = decodeURIComponent(url.pathname.slice("/api/unit/".length));
      return Response.json(unitDetail(ctx, id));
    },
    "GET /api/ops/status": async (_req, _url, ctx) => {
      const ss = await supersetReady();
      return Response.json({ superset: ss, sidecarUp: ctx.world.research.sidecarUp, pages: ctx.world.knowledge.pages, factories: ctx.world.factories.length });
    },
  },
  onHook(ev, ctx) {
    supersetOnHook(ev, ctx);
    memorableOnHook(ev, ctx);
  },
  onTick(ctx) {
    const now = Date.now();
    if (now - lastUsage > 5_000) { lastUsage = now; try { pollUsage(ctx, now); } catch (e) { console.error("[ops] usage:", e); } }
    if (now - lastMines > 3_000) { lastMines = now; try { updateMines(ctx, now); } catch (e) { console.error("[ops] mines:", e); } }
    gbrainTick(ctx, now);
    memorableTick(ctx, now);
    factoriesTick(ctx, now);
    researchTick(ctx, now);
  },
  async onCommand(cmd, ctx) {
    return (await handleSupersetCommand(cmd, ctx)) ?? (await handleFactoryCommand(cmd, ctx)) ?? (await handleResearchCommand(cmd, ctx));
  },
};
export default plugin;
