// S4: Research Center server (SPEC §8.1) — sidecar health/models, River card, corrections, retrain, promote, engine.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import type { CommandResult, RiverModel, TrainingRun } from "../shared/types";
import type { Ctx } from "./plugin";

const APP = new URL("../", import.meta.url).pathname; // <repo>/app/
const REPO = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const fileCache = new Map<string, { mtime: number; val: any }>();
function readJson(path: string): any {
  try {
    if (!existsSync(path)) return undefined;
    const mt = statSync(path).mtimeMs; const c = fileCache.get(path);
    if (c && c.mtime === mt) return c.val;
    const val = JSON.parse(readFileSync(path, "utf8")); fileCache.set(path, { mtime: mt, val }); return val;
  } catch { return undefined; }
}

function toModel(m: any, i: number): RiverModel {
  if (typeof m === "string") return { id: m.split("/").pop() || m, checkpoint: m, base: "", createdAt: Date.now(), active: i === 0 };
  return {
    id: String(m.id ?? m.name ?? m.checkpoint ?? `model-${i}`), checkpoint: String(m.checkpoint ?? m.path ?? m.id ?? ""), base: String(m.base ?? m.base_model ?? ""),
    createdAt: typeof m.createdAt === "number" ? m.createdAt : m.created_at ? Date.parse(m.created_at) || Date.now() : Date.now(),
    active: !!(m.active ?? m.loaded ?? m.current), eval: m.eval ?? m.metrics,
  };
}
const modelList = (j: any): any[] => (Array.isArray(j) ? j : j?.models ?? j?.checkpoints ?? (j?.checkpoint || j?.id ? [j] : []));

let lastPoll = 0, polling = false;
async function poll(ctx: Ctx) {
  if (polling) return; polling = true; lastPoll = Date.now();
  const rs = ctx.world.research;

  try {
    const card = readJson(`${APP}river/card.json`); if (card) rs.card = card;
    let models: RiverModel[] = [];
    const ck = readJson(`${APP}river/checkpoint.json`); if (ck) models = modelList(ck).map(toModel);
    try {
      const h = await fetch(`${ctx.cfg.sentinelUrl}/health`, { signal: AbortSignal.timeout(2500) });
      rs.sidecarUp = h.ok;
      if (h.ok) {
        const mr = await fetch(`${ctx.cfg.sentinelUrl}/models`, { signal: AbortSignal.timeout(2500) });
        if (mr.ok) { const live = modelList(await mr.json()).map(toModel); if (live.length) models = [...live, ...models.filter((m) => !live.some((l) => l.id === m.id))]; }
      }
    } catch { rs.sidecarUp = false; }
    // checkpoints produced by our own training runs are promotable too
    for (const r of rs.runs) if (r.status === "done" && r.checkpoint && !models.some((m) => m.checkpoint === r.checkpoint || m.id === r.id))
      models.push({ id: r.id, checkpoint: r.checkpoint, base: "", createdAt: r.startedAt, active: false });
    // keep a promoted choice sticky if the sidecar doesn't report "active"
    const prev = rs.models.find((m) => m.active); const keep = prev && models.find((m) => m.id === prev.id);
    if (keep && !models.some((m) => m.active)) keep.active = true; else if (models.length && !models.some((m) => m.active) && !rs.runs.some((r) => r.id === models[0].id)) models[0].active = true;
    if (models.length) rs.models = models;
  } finally { polling = false; }
}

export function researchTick(ctx: Ctx, now = Date.now()) { if (now - lastPoll > 10_000) void poll(ctx); }
export function initResearch(ctx: Ctx) {
  const p = `${APP}data/corrections.jsonl`;
  try { if (existsSync(p)) ctx.world.research.corrections = readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).length; } catch {}
  void poll(ctx);
}

function startRetrain(ctx: Ctx): CommandResult {
  const root = ctx.cfg.repoRoot;
  const script = `${APP}river/train.py`;
  if (!existsSync(script)) return { ok: false, message: "Research Center: the River training script hasn't landed yet" };
  if (ctx.world.research.runs.some((r) => r.status === "running" || r.status === "queued")) return { ok: false, message: "Research Center: a training run is already in progress" };
  const py = existsSync(`${root}/.venv-river/bin/python`) ? `${root}/.venv-river/bin/python` : "python3";
  const id = `run-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;
  const out = `app/river/runs/${id}`;
  try { mkdirSync(`${APP}data`, { recursive: true }); } catch {}
  const data = ["app/river/data/train.jsonl", "app/data/corrections.jsonl"].filter((f) => existsSync(`${REPO}/${f}`)).join(",") || "app/river/data/train.jsonl";
  const run: TrainingRun = { id, status: "running", startedAt: Date.now(), steps: [], message: "starting…" };
  ctx.world.research.runs.unshift(run); if (ctx.world.research.runs.length > 10) ctx.world.research.runs.length = 10;
  const env: Record<string, string> = {}; for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  const rk = ctx.env("RIVER_API_KEY"); if (rk) env.RIVER_API_KEY = rk;
  let proc: ReturnType<typeof Bun.spawn>;
  try { proc = Bun.spawn([py, "app/river/train.py", "--data", data, "--out", out], { cwd: REPO, env, stdout: "pipe", stderr: "pipe", stdin: "ignore" }); }
  catch (e: any) { run.status = "failed"; run.message = String(e?.message ?? e); return { ok: false, message: `Retrain failed to start: ${run.message}` }; }
  const corrections0 = ctx.world.research.corrections;
  let errTail = "";
  (async () => {
    const dec = new TextDecoder(); let rest = "";
    for await (const chunk of (proc.stdout as any) as AsyncIterable<Uint8Array>) {
      const lines = (rest + dec.decode(chunk)).split("\n"); rest = lines.pop() ?? "";
      for (const l of lines) {
        let j: any; try { j = JSON.parse(l); } catch { if (l.trim()) run.message = l.trim().slice(0, 140); continue; }
        if (typeof j.step === "number" && typeof j.loss === "number") run.steps.push({ step: j.step, loss: j.loss });
        if (j.checkpoint) run.checkpoint = String(j.checkpoint);
        const c = j.costUsd ?? j.cost_usd ?? j.cost; if (typeof c === "number") run.costUsd = c;
        if (j.message || j.msg || j.status) run.message = String(j.message ?? j.msg ?? j.status).slice(0, 140);
      }
    }
  })().catch(() => {});
  (async () => { const t = await new Response(proc.stderr as ReadableStream).text(); errTail = t.trim().split("\n").slice(-1)[0] ?? ""; })().catch(() => {});
  proc.exited.then((code) => {
    setTimeout(() => {
      run.status = code === 0 ? "done" : "failed";
      if (code !== 0) run.message = (errTail || `exit ${code}`).slice(0, 160).replace(/(sk|key|token)[-_][A-Za-z0-9_-]{8,}/gi, "***");
      else { ctx.world.research.corrections = Math.max(0, ctx.world.research.corrections - corrections0); run.message ||= "done"; }
      ctx.world.log(`🔬 Training ${id} ${run.status}${run.checkpoint ? ` → ${run.checkpoint}` : ""}`);
      void poll(ctx);
    }, 200);
  });
  ctx.world.log(`🔬 Research Center: retraining (${id})`);
  return { ok: true, message: `Retraining ${id} on ${data}` };
}

export async function handleResearchCommand(cmd: any, ctx: Ctx): Promise<CommandResult | undefined> {
  switch (cmd.type) {
    case "correct": {
      const e = ctx.world.enemies.get(cmd.enemyId);
      if (!e) return { ok: false, message: "Enemy not found" };
      const f = cmd.fields ?? {};
      const row = { text: `${e.title}\n${e.reason}`, fields: f, enemyId: e.id, causeKey: e.causeKey, previous: { kind: e.kind, quadrant: e.quadrant, humanOnly: e.humanOnly }, at: new Date().toISOString() };
      try { mkdirSync(`${APP}data`, { recursive: true }); appendFileSync(`${APP}data/corrections.jsonl`, JSON.stringify(row) + "\n"); }
      catch (err: any) { return { ok: false, message: `Couldn't save correction: ${err?.message ?? err}` }; }
      ctx.world.research.corrections++;
      if (f.kind) e.kind = f.kind; if (f.quadrant) e.quadrant = f.quadrant; if (typeof f.humanOnly === "boolean") e.humanOnly = f.humanOnly;
      if (e.classification) {
        const c = e.classification;
        if (f.kind) c.kind = { label: f.kind, p: 1 }; if (f.quadrant) c.quadrant = { label: f.quadrant, p: 1 };
        if (typeof f.humanOnly === "boolean") c.humanOnly = { label: f.humanOnly, p: 1 };
        if (f.department) c.department = { label: f.department, p: 1 }; if (f.tier) c.tier = { label: f.tier, p: 1 };
      }
      ctx.world.log(`✎ Corrected “${e.title}” (${Object.entries(f).map(([k, v]) => `${k}=${v}`).join(", ")}) · ${ctx.world.research.corrections} correction(s) queued for training`, { enemyId: e.id });
      return { ok: true, message: `Correction saved (${ctx.world.research.corrections} queued for the next retrain)` };
    }
    case "research_retrain": return startRetrain(ctx);
    case "research_promote": {
      const rs = ctx.world.research;
      const m = rs.models.find((x) => x.id === cmd.modelId);
      const run = rs.runs.find((r) => r.id === cmd.modelId);
      const checkpoint = m?.checkpoint || run?.checkpoint || cmd.modelId;
      try {
        const r = await fetch(`${ctx.cfg.sentinelUrl}/reload`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ checkpoint }), signal: AbortSignal.timeout(20_000) });
        if (!r.ok) return { ok: false, message: `Sidecar reload failed: HTTP ${r.status}` };
      } catch (e: any) { return { ok: false, message: `Sentinel sidecar not reachable at ${ctx.cfg.sentinelUrl} (${String(e?.message ?? e).slice(0, 80)})` }; }
      for (const x of rs.models) x.active = x.id === cmd.modelId || x.checkpoint === checkpoint;
      if (!rs.models.some((x) => x.active)) rs.models.unshift({ id: cmd.modelId, checkpoint, base: "", createdAt: Date.now(), active: true });
      ctx.world.log(`🔬 Promoted ${cmd.modelId} to the Sentinel`);
      void poll(ctx);
      return { ok: true, message: `Promoted ${cmd.modelId}` };
    }
    case "research_engine": {
      const ok = ["sentinel", "sentinel-base", "fast", "haiku"].includes(cmd.engine);
      if (!ok) return { ok: false, message: `Unknown engine ${cmd.engine}` };
      ctx.world.research.engine = cmd.engine;
      return { ok: true, message: `Triage engine: ${cmd.engine}` };
    }
  }
  return undefined;
}
