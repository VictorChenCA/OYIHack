// J1 History plugin: today's real company history from Claude Code transcripts (motherships + their subagents,
// finished ones included). Loaded at init, refreshed every 60s. Same ids as live hooks, so live units merge:
// if a unit already exists we only fill missing fields. The River Sentinel mothership carries real eval outputs.
import type { Plugin, Ctx } from "../plugin";
import type { DeptId, Unit, Vec } from "../../shared/types";
import { importHistory, riverOutputs, type ParsedSession, type ParsedTranscript } from "../history-import";
import { firstLine, taskSignature, tierOf } from "../world";

const REFRESH_MS = 60_000;
const IDLE_AFTER_MS = 5 * 60_000;
const RIVER_PROJECT = { id: "river", name: "River Sentinel", color: "#40E0D0", planetId: "engineering" as DeptId };

let last = 0;
let stats = { sessions: 0, subagents: 0, sources: [] as string[], river: undefined as string | undefined, at: 0 };
/** Our historical units, kept so the world tick (which drops finished subagents after 8s) can't erase history. */
const mine = new Map<string, Unit>();

const polar = (r: number, a: number): Vec => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }

/** Worktree suffix after "OYIHack-" in the dir name or cwd (e.g. "eng-eng-gbrain-triage-wbc1"); "" for the main repo. */
function suffixOf(s: ParsedSession): string {
  const cwd = s.cwd ?? "";
  const m = cwd.match(/OYIHack[-/]([^/]+)/) ?? s.dir.match(/OYIHack-(.+)$/);
  const x = (m?.[1] ?? "").toLowerCase();
  return x.startsWith(".claude") || x === "worktrees" ? "" : x;
}

function planetFor(ctx: Ctx, suffix: string): DeptId {
  if (!suffix) return "engineering" as DeptId;
  for (const p of ctx.cfg.planets) if (p.prefix.some((x) => x !== "OYIHack" && (suffix.startsWith(x.toLowerCase()) || suffix.includes(x.toLowerCase())))) return p.id;
  if (/river/.test(suffix)) return "engineering" as DeptId;
  return "engineering" as DeptId;
}

function projectFor(ctx: Ctx, planetId: DeptId, suffix: string): string {
  const projects = ctx.world.projects;
  const named = projects.find((p) => p.planetId === planetId && suffix.includes(p.id));
  if (named) return named.id;
  if (!suffix && planetId === "engineering") return (projects.find((p) => p.id === "cc-app") ?? projects[0]).id;
  return (projects.find((p) => p.planetId === planetId) ?? projects[0])?.id ?? "cc-app";
}

function teamTag(ctx: Ctx, planetId: DeptId): string {
  const p = ctx.world.planets.find((x) => x.id === planetId);
  return (p?.name ?? planetId).slice(0, 3).toUpperCase();
}

function taskOf(p: ParsedTranscript, fallback?: string): string | undefined {
  const t = p.firstPrompt ? firstLine(p.firstPrompt) : undefined;
  return (t || fallback || p.aiTitle)?.slice(0, 140);
}

function parkPos(ctx: Ctx, planetId: DeptId, id: string): Vec {
  const team = ctx.world.planets.find((p) => p.id === planetId) ?? ctx.world.planets[0];
  if (!team) return { x: 0, y: 0 };
  const a = Math.atan2(team.pos.y, team.pos.x);
  return add(team.pos, polar(70 + hash(id) * 30, a + Math.PI + (hash(id + "a") - 0.5) * 1.4));
}

function baseUnit(ctx: Ctx, p: ParsedTranscript, o: { id: string; sessionId: string; planetId: DeptId; projectId: string; label: string; role: Unit["role"]; status: Unit["status"]; task?: string; pos: Vec; parentId?: string; agentId?: string; agentType?: string }): Unit {
  const now = Date.now();
  return {
    id: o.id, sessionId: o.sessionId, agentId: o.agentId, agentType: o.agentType, parentId: o.parentId, role: o.role,
    planetId: o.planetId, projectId: o.projectId, tier: tierOf(p.model), model: p.model,
    permissionMode: p.permissionMode ?? "unknown", status: o.status, label: o.label,
    task: o.task, taskSig: o.task ? taskSignature(o.task) : undefined, siteLabel: o.task?.slice(0, 36),
    charted: true, etaMs: Math.max(1000, p.endedAt - p.startedAt), startedAt: p.startedAt || now,
    progress: o.status === "working" ? 0 : 1, hp: 1, toolCount: p.toolCount, failCount: p.failCount, lastTool: p.lastTool,
    lastEventAt: p.endedAt || now, pos: { ...o.pos }, home: { ...o.pos }, target: { ...o.pos }, groups: [],
    tokens: { ...p.tokens }, costUsd: p.costUsd, contextUsed: p.contextUsed, contextWindow: p.longContext ? 1_000_000 : 200_000,
    transcriptPath: p.path, owner: ctx.cfg.owner ?? "Victor Chen",
    endedAt: o.status === "working" ? undefined : p.endedAt, historical: true,
  };
}

/** Merge into the world: new ids are added; live units only get missing fields filled. */
function upsert(ctx: Ctx, u: Unit) {
  const live = ctx.world.units.get(u.id);
  if (live && !mine.has(u.id) && !live.historical) {
    const fill: (keyof Unit)[] = ["owner", "task", "taskSig", "transcriptPath", "agentType", "model", "outputs"];
    for (const k of fill) if ((live as any)[k] == null && (u as any)[k] != null) (live as any)[k] = (u as any)[k];
    if (u.outputs && u.outputs.length) live.outputs = u.outputs;
    if (u.projectId === "river") live.projectId = "river";
    return;
  }
  if (live) {
    // ours from a previous refresh: refresh the numbers, keep its position and any status the live reducer set
    Object.assign(live, {
      tokens: u.tokens, costUsd: u.costUsd, contextUsed: u.contextUsed, toolCount: u.toolCount, failCount: u.failCount,
      lastTool: u.lastTool, lastEventAt: Math.max(live.lastEventAt, u.lastEventAt), model: u.model, tier: u.tier, outputs: u.outputs ?? live.outputs,
    });
    if (live.status === "working" && u.status !== "working") { live.status = u.status; live.endedAt = u.endedAt; live.progress = 1; }
    mine.set(u.id, live);
    return;
  }
  ctx.world.units.set(u.id, u);
  mine.set(u.id, u);
}

function runImport(ctx: Ctx) {
  const now = Date.now();
  const { sessions, sources } = importHistory();
  if (!ctx.world.projects.some((p) => p.id === RIVER_PROJECT.id)) ctx.world.projects.push({ ...RIVER_PROJECT });

  // River Sentinel mothership: the session with the densest River work (and enough of it)
  let river: ParsedSession | undefined;
  for (const s of sessions) {
    if (s.riverScore < 40) continue;
    const dens = s.riverScore / Math.max(1, s.records);
    if (!river || dens > river.riverScore / Math.max(1, river.records)) river = s;
  }
  const ro = river ? riverOutputs(ctx.cfg.repoRoot) : undefined;

  let nSub = 0;
  for (const s of sessions) {
    const suffix = suffixOf(s);
    const planetId = planetFor(ctx, suffix);
    const isRiver = s === river;
    const projectId = isRiver ? "river" : projectFor(ctx, planetId, suffix);
    const tag = teamTag(ctx, planetId);
    const recent = now - s.endedAt < IDLE_AFTER_MS;
    const pos = parkPos(ctx, planetId, s.sessionId);
    const mother = baseUnit(ctx, s, {
      id: s.sessionId, sessionId: s.sessionId, planetId, projectId, role: "mothership", status: recent ? "working" : "idle",
      label: `${tag}-${s.sessionId.slice(0, 4).toUpperCase()}`, task: taskOf(s), pos,
    });
    if (isRiver && ro) { mother.outputs = ro.outputs; mother.label = `RIVER-${s.sessionId.slice(0, 4).toUpperCase()}`; mother.summary = "Trained C&C's Sentinel triage model on River: " + (ro.outputs[0]?.value ?? ""); }
    upsert(ctx, mother);
    const parent = ctx.world.units.get(s.sessionId) ?? mother;

    for (const a of s.subagents) {
      const subRecent = now - a.endedAt < 3 * 60_000;
      const desc = a.description?.trim();
      const u = baseUnit(ctx, a, {
        id: `${s.sessionId}:${a.agentId}`, sessionId: s.sessionId, agentId: a.agentId, agentType: a.agentType, parentId: s.sessionId,
        planetId, projectId, role: "subagent", status: subRecent ? "working" : "done",
        label: (desc || `${tag}-${a.agentId.slice(0, 4)}`).slice(0, 24), task: desc ? desc.slice(0, 140) : taskOf(a, a.agentType),
        pos: add(parent.pos, polar(26 + hash(a.agentId) * 22, hash(a.agentId + "b") * Math.PI * 2)),
      });
      upsert(ctx, u); nSub++;
    }

    // River: one finished instance per trained checkpoint / baseline model, with its real numbers
    if (isRiver && ro) {
      const inst: { key: string; label: string; task: string; outputs: { label: string; value: string; source?: string }[] }[] = [];
      if (ro.baseModel) inst.push({ key: "base", label: `base ${ro.baseModel.split("/").pop()}`, task: `Baseline eval: ${ro.baseModel} (no fine-tune)`, outputs: [{ label: "Unseen accuracy", value: ro.baseAcc != null ? ro.baseAcc.toFixed(3) : "?", source: "app/river/eval.json" }] });
      for (const c of ro.checkpoints) inst.push({
        key: `s${String(c.step).padStart(3, "0")}`, label: `sentinel-v1 step ${c.step}`, task: `LoRA SFT checkpoint @ step ${c.step} (val eval)`,
        outputs: [{ label: "Val accuracy", value: c.valAcc != null ? c.valAcc.toFixed(3) : "?", source: "app/river/checkpoint.json" }, ...(c.inference ? [{ label: "Checkpoint", value: c.inference, source: "app/river/checkpoint.json" }] : [])],
      });
      if (ro.fastClf) inst.push({ key: "fast", label: "fast_clf (local)", task: "Local fast classifier (sklearn) baseline", outputs: [
        { label: "Unseen accuracy", value: ro.fastClf.test_unseen?.mean != null ? Number(ro.fastClf.test_unseen.mean).toFixed(3) : "?", source: "app/river/card.json" },
        { label: "Latency (10 items)", value: `${ro.fastClf.latency_ms_10_items ?? "?"} ms`, source: "app/river/card.json" },
      ] });
      inst.forEach((it, i) => {
        const id = `${s.sessionId}:river-${it.key}`;
        const u = baseUnit(ctx, { ...s, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0, toolCount: 0, failCount: 0, lastTool: undefined, model: undefined }, {
          id, sessionId: s.sessionId, agentId: `river-${it.key}`, agentType: "river-instance", parentId: s.sessionId,
          planetId, projectId: "river", role: "subagent", status: "done", label: it.label, task: it.task,
          pos: add(parent.pos, polar(30 + (i % 3) * 12, (i / Math.max(1, inst.length)) * Math.PI * 2)),
        });
        u.tier = "river"; u.model = it.key === "base" ? ro.baseModel : "sentinel-v1"; u.outputs = it.outputs;
        upsert(ctx, u); nSub++;
      });
    }
  }
  stats = { sessions: sessions.length, subagents: nSub, sources, river: river?.sessionId, at: now };
}

const plugin: Plugin = {
  name: "history",
  init(ctx) {
    try { runImport(ctx); last = Date.now(); ctx.world.log?.(`History: ${stats.sessions} sessions, ${stats.subagents} subagents from transcripts`); }
    catch (e) { console.error("[history] init:", (e as Error).message); }
  },
  onTick(ctx) {
    const now = Date.now();
    if (now - last > REFRESH_MS) { last = now; try { runImport(ctx); } catch (e) { console.error("[history] refresh:", (e as Error).message); } }
    // keep finished history on the map (the world tick drops done subagents) and seat it next to its parent
    for (const [id, u] of mine) {
      if (!ctx.world.units.has(id)) { if (u.status === "dead") { mine.delete(id); continue; } ctx.world.units.set(id, u); }
      if (u.role === "subagent" && u.status === "done") {
        const parent = u.parentId ? ctx.world.units.get(u.parentId) : undefined;
        if (!parent) continue;
        const want = add(parent.pos, polar(26 + hash(id) * 24, hash(id + "b") * Math.PI * 2));
        u.pos = lerp(u.pos, want, 0.1); u.home = parent.pos; u.target = want;
      }
    }
  },
  routes: {
    "GET /api/history": () => Response.json({ sessions: stats.sessions, subagents: stats.subagents, sources: stats.sources, river: stats.river ?? null, refreshedAt: stats.at }),
  },
};

export default plugin;
