// S4 Ops plugin: Superset (spawn/prompt/attack/deploy/resolve), transcripts (usage + /api/unit/:id), GBrain counts,
// Memorable recall/record, mines, factories and the Research Center server. Every piece degrades gracefully.
import type { Plugin, Ctx } from "../plugin";
import { readTail } from "../transcript-tail";
import { openSync, readSync, closeSync } from "node:fs";
/** First real user prompt in a transcript (scan the head; prompts come first). */
function firstPrompt(path: string): string | undefined {
  try {
    const fd = openSync(path, "r"); const buf = Buffer.alloc(262_144); const n = readSync(fd, buf, 0, buf.length, 0); closeSync(fd);
    for (const line of buf.subarray(0, n).toString("utf8").split("\n")) {
      if (!line.startsWith("{")) continue; let d: any; try { d = JSON.parse(line); } catch { continue; }
      if (d.type !== "user" || d.isMeta || d.isSidechain) continue;
      const c = d.message?.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.find((b: any) => b?.type === "text")?.text : undefined;
      if (text && !String(text).startsWith("<")) return String(text);
    }
  } catch {}
  return undefined;
}
import { firstLine, taskSignature } from "../world";
let lastRecover = 0;
function recoverTasks(ctx: Ctx) {
  for (const u of ctx.world.units.values()) {
    if ((u.task && !/^(You are (a unit|an agent) in C&C|↻)/.test(u.task)) || u.simulated || u.role !== "mothership" || !u.transcriptPath) continue;
    const p = firstPrompt(u.transcriptPath) ?? readTail(u.transcriptPath, 400)?.lastPrompt; if (!p) continue;
    const task = firstLine(p); if (!task) continue;
    u.task = task.slice(0, 140); u.taskSig = taskSignature(task); u.siteLabel = task.slice(0, 36);
    if (u.status === "idle") u.status = "working";
  }
}
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
    if (Date.now() - lastRecover > 4000) { lastRecover = Date.now(); try { recoverTasks(ctx); } catch {} }
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
