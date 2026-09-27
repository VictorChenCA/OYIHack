// World reducer: Claude Code hook events → the solar system. Owned by the main session (slices use WorldApi mutators).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type {
  Advice, Autonomy, Classification, DeptId, Enemy, EnemyKind, Factory, FeedItem, HideFilter, HookEvent, Knowledge, MemoryEvent,
  Mine, Planet, Project, Quadrant, ResearchState, Stance, Tier, Unit, Vec, View, WorldState, PermissionMode,
} from "../shared/types";
import type { AppConfig, WorldApi } from "./plugin";

const DATA = new URL("../data/", import.meta.url).pathname;
mkdirSync(DATA, { recursive: true });
const DURATIONS = DATA + "durations.json";
const SYSTEM_R = 1680;       // fog (0.78·R ≈ 1310) begins where tasks longer than ~1 minute travel
const TEAM_R = 820;           // every team sits the same distance from the sun (memory)
const UNIT = 260;             // one motion "unit" in world space (see distUnits)
const FOG_R = SYSTEM_R * 0.78;
const DAY = 86_400_000;

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 2 ** 32; };
const polar = (r: number, a: number): Vec => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const len = (v: Vec) => Math.hypot(v.x, v.y);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const short = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
export const firstLine = (raw: string) => {
  if (/^\s*<(task-notification|system-reminder|cross-session-message|local-command)/.test(raw)) {
    const sum = raw.match(/<summary>([^<]{1,200})<\/summary>/); return sum ? `↻ ${sum[1].trim()}` : "↻ system notification";
  }
  const s = raw.replace(/^\s*You are (a unit|an agent) in C&C[\s\S]*?\n\s*\n/, "").replace(/<pasted_content[^>]*>/g, "").replace(/<\/?[a-z_-]+[^>]*>/gi, " ");
  return (s.split("\n").find((l) => l.trim()) ?? s).trim();
};

export const taskSignature = (prompt: string) =>
  firstLine(prompt).toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/#?\d+/g, "#").replace(/[^a-z# ]+/g, " ")
    .split(/\s+/).filter(Boolean).slice(0, 8).join(" ");

/** Legacy department ids (the Sentinel was trained on these) → current teams. */
export const normDept = (id: string): DeptId => (id === "arts" || id === "product_design" ? "design" : id) as DeptId;

/** Motion law (founder spec): distance in "units" after t seconds — 1s → 1, 60s → 1.5, ∞ → 2. Slow, decelerating, outward. */
export const distUnits = (sec: number) => (sec <= 1 ? Math.max(0, sec) : 2 - 1 / (1 + Math.log(sec) / Math.log(60)));

export function tierOf(model?: string): Tier {
  const m = (model ?? "").toLowerCase();
  if (m.includes("haiku")) return "haiku"; if (m.includes("sonnet")) return "sonnet"; if (m.includes("opus")) return "opus";
  if (m.includes("fable")) return "fable"; return "unknown";
}

/** Rules-first blocker triage (instant). S3 replaces it with the Sentinel / Haiku classification via applyClassification. */
function ruleTriage(ev: HookEvent): { kind: EnemyKind; quadrant: Quadrant; humanOnly: boolean; title: string; reason: string; causeKey: string } | null {
  const tool = ev.tool_name ?? "";
  const cmd = String((ev.tool_input as any)?.command ?? (ev.tool_input as any)?.file_path ?? "");
  switch (ev.hook_event_name) {
    case "PermissionRequest": {
      const head = cmd.split(/\s+/).slice(0, 2).join(" ") || tool;
      const external = /\b(git push|gh pr (comment|create|merge)|deploy|publish|curl -X (POST|PUT|DELETE)|rm -rf|npm publish)\b/i.test(cmd);
      return { kind: "approval", quadrant: external ? "schedule" : "delegate", humanOnly: external, title: `Approve ${tool}: ${short(head, 32)}`, reason: short(cmd || tool, 90), causeKey: `approval:${tool}:${head}` };
    }
    case "Notification": {
      const t = ev.notification_type ?? "";
      if (t === "permission_prompt") return { kind: "approval", quadrant: "delegate", humanOnly: false, title: short(ev.message ?? "Permission needed", 40), reason: ev.message ?? "", causeKey: `approval:${short(ev.message ?? "", 40)}` };
      if (t === "idle_prompt") return { kind: "missing_info", quadrant: "drop", humanOnly: false, title: "Waiting for input", reason: ev.message ?? "Idle, waiting for the next instruction", causeKey: `missing_info:idle:${ev.session_id}` };
      if (t === "agent_needs_input" || t.startsWith("elicitation")) {
        if (t === "elicitation_complete" || t === "elicitation_response") return null;
        return { kind: "missing_info", quadrant: "schedule", humanOnly: false, title: short(ev.message ?? "Needs input", 40), reason: ev.message ?? "", causeKey: `missing_info:${short(ev.message ?? "", 40)}` };
      }
      return null;
    }
    case "StopFailure": {
      const e = ev.error ?? "error";
      if (e === "authentication_failed") return { kind: "credential", quadrant: "do_now", humanOnly: true, title: "API key / auth failed", reason: ev.error_details ?? e, causeKey: "credential:auth" };
      if (e === "billing_error") return { kind: "billing", quadrant: "do_now", humanOnly: true, title: "Credits exhausted", reason: ev.error_details ?? e, causeKey: "billing:api" };
      if (e === "rate_limit" || e === "overloaded") return { kind: "rate_limit", quadrant: "delegate", humanOnly: false, title: "Rate limited", reason: ev.error_details ?? e, causeKey: "rate_limit:api" };
      return { kind: "failure", quadrant: "schedule", humanOnly: false, title: short(ev.error_details ?? e, 40), reason: ev.error_details ?? e, causeKey: `failure:${e}` };
    }
    case "Stop": {
      const m = (ev.last_assistant_message ?? "").slice(-600);
      const need = m.match(/\b(need|missing|requires?|waiting (for|on))\b[^.?!\n]{0,80}\b([A-Z][A-Z0-9_]{3,}(_KEY|_TOKEN|_SECRET)|api key|token|credentials?|phone number|captcha|payment|account)\b/i);
      if (need) {
        const key = need[3].toUpperCase().includes("_") ? need[3].toUpperCase() : need[3].toLowerCase();
        const human = /phone|captcha|payment|account|token|key|secret|credential/i.test(key);
        const kind: EnemyKind = /account|phone|captcha/i.test(key) ? "account" : /payment/i.test(key) ? "billing" : "credential";
        return { kind, quadrant: "do_now", humanOnly: human, title: `Needs ${short(key, 28)}`, reason: short(m.split("\n").pop() ?? m, 120), causeKey: `${kind}:${key}` };
      }
      if (/\?\s*$/.test(m.trim())) return { kind: "missing_info", quadrant: "schedule", humanOnly: false, title: "Question for you", reason: short(m.trim().split("\n").pop() ?? "", 120), causeKey: `missing_info:q:${ev.session_id}` };
      return null;
    }
  }
  return null;
}

interface SpawnRec { name: string; planetId: DeptId; projectId?: string; tier?: string; permissionMode?: string; workspaceId?: string; terminalId?: string; at: number }

export class World implements WorldApi {
  cfg: AppConfig;
  planets: Planet[];
  projects: Project[];
  units = new Map<string, Unit>();
  enemies = new Map<string, Enemy>();
  factories: Factory[] = [];
  mines: Mine[];
  research: ResearchState;
  knowledge: Knowledge = { pages: 0, facts: 0, procedures: 0, recent: [] };
  views: View[] = [{ id: "default", name: "Default", source: "default", highlight: [], hide: [], pings: [], createdAt: Date.now() }];
  activeViewId = "default";
  filter: HideFilter = { planets: [], projects: [], units: [], enemies: [], layers: [] };
  autonomy: Autonomy = "assist";
  stances: Record<number, Stance> = {};
  extraAdvice: Advice[] = [];
  overview?: string;
  feed: FeedItem[] = [];
  sunPulse = 0;
  durations: Record<string, number[]> = {};
  spawns: SpawnRec[] = [];
  planetStats = new Map<DeptId, { unitsEver: number; tools: number }>();
  offsets = new Map<string, { angle: number; dist: number }>();
  sigExample = new Map<string, string>();
  replaying = false;

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    this.projects = cfg.projects;
    if (existsSync(DURATIONS)) try { this.durations = JSON.parse(readFileSync(DURATIONS, "utf8")); } catch {}
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const hackStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 30).getTime();
    const hackEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0).getTime();
    this.planets = cfg.planets.map((p, i) => ({
      id: p.id, name: p.name, color: p.color,
      baseAngle: -Math.PI / 2 + (i * 2 * Math.PI) / cfg.planets.length, // evenly spaced around the sun, fixed
      orbitRadius: TEAM_R,                                              // all teams equidistant from memory
      cycle: p.id === "engineering"
        ? { kind: "deadline", label: "Hackathon submission · 17:00", startAt: hackStart, endAt: hackEnd }
        : { kind: "sprint", label: "Sprint 1 · 1 week", startAt: dayStart, endAt: dayStart + 7 * DAY },
      progress: 0, pos: { x: 0, y: 0 }, colonization: 0, knowledge: 0, memTraffic: 0,
    }));
    this.mines = cfg.mines.map((m, i) => ({ ...m, remaining: m.total, burnPerDay: 0, pos: polar(360, Math.PI / 2 + (i - (cfg.mines.length - 1) / 2) * 0.42) }));
    this.research = { pos: polar(210, -Math.PI / 2 + 0.55), models: [], runs: [], corrections: 0, sidecarUp: false, engine: "sentinel" };
    this.tickPlanets(Date.now());
  }

  log(text: string, extra: Partial<FeedItem> = {}) { this.feed.unshift({ at: Date.now(), text, ...extra }); if (this.feed.length > 200) this.feed.length = 200; }
  planet(id: DeptId) { const pid = normDept(id); return this.planets.find((p) => p.id === pid) ?? this.planets[0]; }
  stats(id: DeptId) { id = normDept(id); let s = this.planetStats.get(id); if (!s) this.planetStats.set(id, (s = { unitsEver: 0, tools: 0 })); return s; }

  registerSpawn(s: Omit<SpawnRec, "at">) { this.spawns.push({ ...s, at: Date.now() }); if (this.spawns.length > 100) this.spawns.shift(); }
  attach(unitId: string, workspaceId?: string, terminalId?: string) { const u = this.units.get(unitId); if (u) { if (workspaceId) u.workspaceId = workspaceId; if (terminalId) u.terminalId = terminalId; } }

  private planetFor(ev: HookEvent, spawn?: SpawnRec): DeptId {
    if (spawn) return spawn.planetId;
    const hay = `${ev.cwd ?? ""} ${ev._workspaceId ?? ""}`;
    for (const p of this.cfg.planets) if (p.prefix.some((x) => x !== "OYIHack" && hay.includes(x))) return p.id;
    if (ev._simulated) { const m = hay.match(/sim-(\w+)/); if (m && this.planets.some((p) => p.id === m[1])) return m[1] as DeptId; }
    return "engineering";
  }

  ensureUnit(ev: HookEvent): Unit {
    let mother = this.units.get(ev.session_id);
    if (!mother) {
      const spawn = this.spawns.find((s) => (ev.cwd ?? "").includes(s.name) || (ev._workspaceId && s.workspaceId === ev._workspaceId));
      const planetId = normDept(this.planetFor(ev, spawn));
      const project = this.projects.find((p) => p.id === spawn?.projectId) ?? this.projects.find((p) => p.planetId === planetId) ?? this.projects[0];
      const home = this.planet(planetId).pos;
      const sim = !!ev._simulated;
      mother = {
        id: ev.session_id, sessionId: ev.session_id, role: "mothership", planetId, projectId: project.id,
        tier: (spawn?.tier as Tier) ?? (sim ? (["haiku", "sonnet", "opus", "fable"] as Tier[])[Math.floor(hash(ev.session_id) * 4)] : "unknown"),
        permissionMode: (spawn?.permissionMode as PermissionMode) ?? ((ev.permission_mode as PermissionMode) || "unknown"),
        status: "idle", label: `${this.planet(planetId).name.slice(0, 3).toUpperCase()}-${ev.session_id.replace(/^sim-\w+-/, "").slice(0, 4)}`,
        charted: false, etaMs: null, startedAt: Date.now(), progress: 0, hp: 1, toolCount: 0, failCount: 0, lastEventAt: Date.now(),
        pos: { ...home }, home, target: { ...home }, groups: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0,
        contextUsed: 0, contextWindow: 200_000, transcriptPath: ev.transcript_path, workspaceId: ev._workspaceId ?? spawn?.workspaceId,
        terminalId: ev._terminalId ?? spawn?.terminalId, simulated: sim,
      };
      this.units.set(mother.id, mother);
      this.stats(planetId).unitsEver++;
      this.log(`${mother.label} joined ${this.planet(planetId).name}`, { unitId: mother.id });
    }
    if (ev.transcript_path && !mother.transcriptPath) mother.transcriptPath = ev.transcript_path;
    if (ev._workspaceId && !mother.workspaceId) mother.workspaceId = ev._workspaceId;
    if (ev._terminalId && !mother.terminalId) mother.terminalId = ev._terminalId;
    if (ev.permission_mode && !ev.agent_id) mother.permissionMode = ev.permission_mode as PermissionMode;
    if (!ev.agent_id) return mother;
    const id = `${ev.session_id}:${ev.agent_id}`;
    let sub = this.units.get(id);
    if (!sub) {
      sub = {
        ...mother, id, agentId: ev.agent_id, agentType: ev.agent_type, parentId: mother.id, role: "subagent", status: "working",
        label: `${(ev.agent_type ?? "sub").slice(0, 8)}·${ev.agent_id.slice(0, 3)}`, startedAt: Date.now(), toolCount: 0, failCount: 0, hp: 1,
        progress: 0, pos: { ...mother.pos }, home: { ...mother.pos }, groups: [], blockedBy: undefined, attacking: undefined,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0, contextUsed: 0, summary: undefined,
        transcriptPath: ev.agent_transcript_path, permissionMode: (ev.permission_mode as PermissionMode) || mother.permissionMode,
      };
      this.units.set(id, sub);
    }
    return sub;
  }

  startTask(u: Unit, prompt: string) {
    const task = firstLine(prompt);
    u.task = short(task, 140);
    u.taskSig = taskSignature(task);
    this.sigExample.set(u.taskSig, short(task, 48));
    const hist = this.durations[u.taskSig] ?? [];
    u.charted = u.charted || hist.length > 0;
    const hist2 = hist.filter((x) => x >= 8000);
    u.charted = u.charted || hist2.length > 0;
    u.etaMs = hist2.length ? Math.max(20_000, median(hist2)) : null;
    u.startedAt = Date.now(); u.progress = 0; u.hp = 1; u.failCount = 0; u.status = "working";
    // the task's SITE: stable per (planet, task signature), so a repeated task flies the same charted route
    this.offsets.set(u.id, { angle: (hash(u.planetId + u.taskSig) - 0.5) * 1.3, dist: 190 + hash(u.taskSig + "d") * 170 });
    u.siteLabel = short(task, 36);
    this.log(`${u.label} ▶ ${short(task, 60)}${u.etaMs ? ` · ETA ${Math.round(u.etaMs / 1000)}s` : " · frontier"}`, { unitId: u.id });
  }

  finishTask(u: Unit) {
    if (!this.replaying && u.task && u.taskSig && (u.status === "working" || u.status === "acting" || u.status === "attacking")) {
      const took = Date.now() - u.startedAt;
      if (took >= 8000) (this.durations[u.taskSig] ??= []).push(took); // ignore instant stops (notifications, aborted turns)
      try { writeFileSync(DURATIONS, JSON.stringify(this.durations)); } catch {}
      this.log(`${u.label} ✓ ${short(u.task, 50)} in ${Math.round(took / 1000)}s`, { unitId: u.id });
    }
    u.status = u.role === "subagent" ? "done" : "idle";
    u.progress = 1; u.attacking = undefined;
  }

  memoryEvent(ev: MemoryEvent) {
    this.knowledge.recent.unshift(ev); if (this.knowledge.recent.length > 40) this.knowledge.recent.length = 40;
    if (ev.kind === "write") this.knowledge.facts++;
    this.sunPulse = Math.min(1, this.sunPulse + (ev.kind === "write" ? 0.5 : 0.04));
    if (ev.planetId) { const p = this.planet(ev.planetId); p.memTraffic = Math.min(1, p.memTraffic + (ev.kind === "write" ? 0.35 : 0.08)); }
  }
  setPlanetKnowledge(planetId: DeptId, pages: number) { this.planet(planetId).knowledge = pages; }
  markCharted(unitId: string, veteran: boolean) { const u = this.units.get(unitId); if (u) { u.charted = true; u.veteran = veteran; } }
  setSummary(unitId: string, summary: string) { const u = this.units.get(unitId); if (u) { u.summary = summary; u.summaryAt = Date.now(); } }
  setUnitUsage(unitId: string, x: Pick<Unit, "tokens" | "costUsd" | "contextUsed" | "contextWindow" | "model" | "tier">) {
    const u = this.units.get(unitId); if (!u) return;
    Object.assign(u, x);
  }

  // ---------- enemies ----------
  /** A blocker sits just beyond the frontier of the team it concerns (the Sentinel's department call, else the blocked
   *  agents' teams). Shared by several teams → between them. Same cause → same spot. */
  private enemyPos(e: Enemy): Vec {
    const dept = e.classification && e.classification.department.p >= 0.5 ? [normDept(e.classification.department.label)] : [];
    const teams = [...new Set([...dept, ...e.planetIds])].map((id) => this.planet(id as DeptId));
    const c = teams.length ? teams.reduce((a, p) => add(a, p.pos), { x: 0, y: 0 }) : { x: 1, y: 0 };
    const mid = { x: c.x / Math.max(1, teams.length), y: c.y / Math.max(1, teams.length) };
    const a = Math.atan2(mid.y, mid.x) + (hash(e.causeKey) - 0.5) * 0.28;
    return polar(TEAM_R + 90 + 2.35 * UNIT + hash(e.id) * 50, a);
  }
  block(u: Unit, t: NonNullable<ReturnType<typeof ruleTriage>>) {
    let e = [...this.enemies.values()].find((x) => x.causeKey === t.causeKey && !x.resolved);
    if (!e) {
      e = { id: `en-${Math.floor(hash(t.causeKey + Date.now()) * 1e9).toString(36)}`, causeKey: t.causeKey, title: t.title, reason: t.reason, kind: t.kind,
        quadrant: t.quadrant, humanOnly: t.humanOnly, blocked: [], attackers: [], strength: 0, createdAt: Date.now(), planetIds: [], pos: { x: 0, y: 0 }, simulated: u.simulated };
      this.enemies.set(e.id, e);
      this.log(`${e.humanOnly ? "★" : "⚠"} ${e.title}`, { enemyId: e.id, level: e.quadrant === "do_now" ? "alert" : "warn" });
    }
    if (!e.blocked.includes(u.id)) e.blocked.push(u.id);
    if (!e.planetIds.includes(u.planetId)) e.planetIds.push(u.planetId);
    e.pendingPermission ||= t.kind === "approval";
    e.pos = this.enemyPos(e);
    u.status = "blocked"; u.blockedBy = e.id;
    return e;
  }
  unblock(u: Unit) {
    if (!u.blockedBy) return;
    const e = this.enemies.get(u.blockedBy); u.blockedBy = undefined;
    if (!e) return;
    e.blocked = e.blocked.filter((id) => id !== u.id);
    if (e.blocked.length === 0 && !e.resolved) { e.resolved = true; this.log(`✓ Cleared: ${e.title}`); setTimeout(() => this.enemies.delete(e.id), 1500); }
  }
  resolveEnemy(enemyId: string, note?: string): string[] {
    const e = this.enemies.get(enemyId); if (!e) return [];
    const ids = [...e.blocked];
    for (const id of ids) { const u = this.units.get(id); if (u) { u.blockedBy = undefined; if (u.status === "blocked") u.status = "working"; } }
    for (const id of e.attackers) { const u = this.units.get(id); if (u) { u.attacking = undefined; if (u.status === "attacking") u.status = "working"; } }
    e.blocked = []; e.resolved = true;
    this.log(`✓ Resolved: ${e.title}${note ? ` (${short(note, 40)})` : ""}`);
    setTimeout(() => this.enemies.delete(e.id), 1500);
    return ids;
  }
  applyClassification(enemyId: string, cls: Classification) {
    const e = this.enemies.get(enemyId); if (!e) return;
    e.classification = cls; e.kind = cls.kind.label; e.quadrant = cls.quadrant.label; e.humanOnly = cls.humanOnly.label;
    // escalate: 3+ blocked is always urgent+important
    if (e.blocked.length >= 3 && e.quadrant !== "do_now") e.quadrant = "do_now";
  }

  // ---------- hooks ----------
  handle(ev: HookEvent) {
    if (!ev?.hook_event_name || !ev.session_id) return;
    const u = this.ensureUnit(ev);
    u.lastEventAt = Date.now();
    const tool = ev.tool_name ?? "";
    const input = ev.tool_input ? short(String((ev.tool_input as any).command ?? (ev.tool_input as any).file_path ?? (ev.tool_input as any).url ?? (ev.tool_input as any).query ?? (ev.tool_input as any).slug ?? JSON.stringify(ev.tool_input)), 90) : "";
    switch (ev.hook_event_name) {
      case "UserPromptSubmit": {
        this.unblock(u);
        // system notifications (a background subagent finished, a peer message…) continue the current task, they don't start a new one
        if (/^\s*<(task-notification|system-reminder|cross-session-message|local-command)/.test(ev.prompt ?? "") && u.task && !u.task.startsWith("↻")) { u.status = "working"; break; }
        this.startTask(u, ev.prompt ?? "task"); break;
      }
      case "SubagentStart": { u.task = ev.agent_type ?? "subagent"; u.status = "working"; u.startedAt = Date.now(); const sibs = [...this.units.values()].filter((x) => x.parentId === u.parentId).length; this.offsets.set(u.id, { angle: sibs * 0.9 + hash(u.id) * 0.4, dist: 55 + (sibs % 3) * 22 }); u.siteLabel = `${ev.agent_type ?? "subagent"} task`; break; }
      case "PreToolUse": {
        this.unblock(u); if (u.status !== "attacking") u.status = "acting"; u.toolCount++; u.lastTool = tool; u.lastToolInput = input;
        this.stats(u.planetId).tools++;
        const m = tool.match(/^mcp__(gbrain[\w-]*)__(\w+)/);
        if (m) {
          const op = m[2]; const write = /remember|put_page|add_link|capture|forget/.test(op);
          const ti = (ev.tool_input ?? {}) as any;
          const slug = String(ti.slug ?? ti.entity ?? "") || undefined;
          const text = write ? short(String(ti.fact ?? ti.title ?? (typeof ti.content === "string" ? ti.content.replace(/^---[\s\S]*?---/, "").replace(/[#*_>`]/g, "").trim() : "") ?? slug ?? ""), 90) || undefined : undefined;
          this.memoryEvent({ at: Date.now(), op, kind: write ? "write" : "read", slug, unitId: u.id, planetId: this.planet(u.planetId).id, text });
        }
        break;
      }
      case "PostToolUse": this.unblock(u); if (u.status === "acting") u.status = "working"; break;
      case "PostToolUseFailure": u.failCount++; u.hp = Math.max(0, u.hp - 0.06); if (u.status === "acting") u.status = "working"; break;
      case "SubagentStop": this.unblock(u); this.finishTask(u); break;
      case "SessionEnd": this.unblock(u); u.status = "dead"; break;
      case "Stop": {
        this.unblock(u);
        const t = ruleTriage(ev);
        if (t) { this.block(u, t); break; }
        if (u.role === "mothership") this.finishTask(u);
        break;
      }
      default: {
        const t = ruleTriage(ev);
        if (t) this.block(u, t);
      }
    }
    if (ev.hook_event_name === "StopFailure" || ev.hook_event_name === "PermissionRequest" || ev.hook_event_name === "Notification") { /* handled by ruleTriage above */ }
  }

  // ---------- tick ----------
  private tickPlanets(_now: number) {
    for (const p of this.planets) {
      p.progress = 0;
      p.pos = polar(p.orbitRadius, p.baseAngle);
      const st = this.stats(p.id);
      p.colonization = Math.min(3, (st.unitsEver > 0 ? 1 : 0) + (st.tools > 25 ? 1 : 0) + (p.knowledge > 5 || st.tools > 120 ? 1 : 0)) as Planet["colonization"];
      p.memTraffic *= 0.97;
    }
  }
  tick(now = Date.now()) {
    this.tickPlanets(now);
    this.sunPulse *= 0.94;
    for (const u of this.units.values()) {
      if (u.status === "dead") { if (now - u.lastEventAt > 8000) this.units.delete(u.id); continue; }
      u.planetId = normDept(u.planetId);
      const parent = u.parentId ? this.units.get(u.parentId) : undefined;
      const team = this.planet(u.planetId);
      const teamA = Math.atan2(team.pos.y, team.pos.x);
      const off = this.offsets.get(u.id) ?? { angle: (hash(u.id) - 0.5) * 1.1, dist: 0 };
      // everything explores OUTWARD: from its home, along a bearing that fans out from the sun→team direction
      const home = parent ? parent.pos : add(team.pos, polar(90, teamA));
      const bearing = parent ? teamA + off.angle * 0.9 : teamA + off.angle * 0.55;
      const scale = parent ? UNIT * 0.35 : UNIT;
      u.home = home;
      const dirTo = (d: number) => add(home, polar(d, bearing));
      // dotted line = expected length of the task (ETA) or the frontier (2 units) if it's never been done
      u.finishDist = (u.etaMs ? distUnits(u.etaMs / 1000) : 2) * scale;
      if (u.attacking && this.enemies.get(u.attacking)) {
        const e = this.enemies.get(u.attacking)!; u.target = e.pos;
        u.pos = lerp(u.pos, lerp(u.pos, e.pos, 0.85), 0.01); // slow approach
        continue;
      }
      u.target = dirTo(u.finishDist);
      if (u.status === "idle") {
        const idle = [...this.units.values()].filter((x) => x.planetId === u.planetId && x.role === "mothership" && x.status === "idle");
        const i = idle.indexOf(u);
        u.pos = lerp(u.pos, add(team.pos, polar(70 + Math.floor(i / 5) * 24, teamA + Math.PI + (i % 5 - 2) * 0.35)), 0.02); // park slowly on the sun side
        continue;
      }
      if (u.status === "done") { if (now - u.lastEventAt > 8000 && u.role === "subagent") this.units.delete(u.id); continue; } // done: stays put, fades
      const elapsed = (now - u.startedAt) / 1000;
      if (u.status !== "blocked") u.progress = Math.min(1, distUnits(elapsed) / 2);
      const budget = u.etaMs ? Math.max(60_000, u.etaMs * 1.6) : 12 * 60_000;
      u.hp = Math.max(0.05, Math.min(1, 1 - (now - u.startedAt) / budget) - u.failCount * 0.04);
      const want = dirTo(distUnits(u.status === "blocked" ? Math.max(0, (u.lastEventAt - u.startedAt) / 1000) : elapsed) * scale);
      u.pos = lerp(u.pos, want, 0.08); // smooth, never fast
      // dependency links: waiting on another agent's output
      const dep = u.blockedBy ? this.enemies.get(u.blockedBy) : undefined;
      u.dependsOn = dep?.dependsOnUnit ? [dep.dependsOnUnit] : undefined;
    }
    for (const e of this.enemies.values()) {
      if (e.resolved) continue;
      e.blocked = e.blocked.filter((id) => this.units.get(id)?.blockedBy === e.id);
      e.attackers = e.attackers.filter((id) => this.units.get(id)?.attacking === e.id);
      if (e.blocked.length === 0 && e.attackers.length === 0 && now - e.createdAt > 3000) { e.resolved = true; setTimeout(() => this.enemies.delete(e.id), 1500); continue; }
      e.strength = e.blocked.length + Math.min(3, (now - e.createdAt) / 300_000);
      if (e.blocked.length >= 3) e.quadrant = "do_now";
      e.pos = lerp(e.pos, this.enemyPos(e), 0.05);
    }
    for (const f of this.factories) { const p = this.planet(f.planetId); f.pos = add(p.pos, polar(120, Math.atan2(p.pos.y, p.pos.x) + Math.PI * 0.75 + hash(f.id) * 0.5)); }
  }

  advice(): Advice[] {
    const out: Advice[] = [...this.extraAdvice];
    const enemies = [...this.enemies.values()].filter((e) => !e.resolved);
    const q: Record<Quadrant, number> = { do_now: 0, schedule: 1, delegate: 2, drop: 3 };
    enemies.sort((a, b) => Number(b.humanOnly) - Number(a.humanOnly) || q[a.quadrant] - q[b.quadrant] || b.blocked.length - a.blocked.length);
    for (const e of enemies.slice(0, 3)) out.push({ id: `en:${e.id}`, priority: 10 - q[e.quadrant] + (e.humanOnly ? 1 : 0), text: `${e.humanOnly ? "Needs you: " : ""}${e.blocked.length} agent${e.blocked.length === 1 ? "" : "s"} blocked by “${e.title}”${e.humanOnly ? "" : ": send an agent"}` });
    const units = [...this.units.values()];
    for (const p of this.planets) {
      const idle = units.filter((u) => u.planetId === p.id && u.role === "mothership" && u.status === "idle");
      if (idle.length) out.push({ id: `idle:${p.id}`, priority: 5, text: `${idle.length} agent${idle.length > 1 ? "s" : ""} idle in ${p.name}: assign a task` });
      if (p.colonization === 0) out.push({ id: `colonize:${p.id}`, priority: 3, text: `${p.name} has no agents yet: start one` });
    }
    const sigs = new Map<string, number>(); for (const [sig, xs] of Object.entries(this.durations)) sigs.set(sig, xs.length);
    const rep = [...sigs.entries()].find(([sig, n]) => n >= 3 && this.sigExample.has(sig) && !this.factories.some((f) => f.prompt.toLowerCase().includes(sig.split(" ")[0])));
    if (rep) out.push({ id: `fac:${rep[0]}`, priority: 4, text: `“${this.sigExample.get(rep[0]) ?? rep[0]}” ran ${rep[1]}×: build a factory for it` });
    if (!units.some((u) => !u.charted && (u.status === "working" || u.status === "acting"))) out.push({ id: "frontier", priority: 1, text: "Nothing new being explored: try a task you haven't done before" });
    for (const m of this.mines) if (m.remaining / m.total < 0.15) out.push({ id: `mine:${m.id}`, priority: 8, text: `${m.label} credits below 15%: top up` });
    const seen = new Set<string>();
    return out.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))).sort((a, b) => b.priority - a.priority).slice(0, 7);
  }

  /** Survive restarts: real agents, blockers and learned state (simulated ones are skipped). */
  persistTo(path: string) {
    const units = [...this.units.values()].filter((u) => !u.simulated && u.status !== "dead");
    const enemies = [...this.enemies.values()].filter((e) => !e.simulated && !e.resolved);
    try { writeFileSync(path, JSON.stringify({ at: Date.now(), units, enemies, factories: this.factories, corrections: this.research.corrections,
      stats: [...this.planetStats.entries()], offsets: [...this.offsets.entries()], sigExample: [...this.sigExample.entries()], knowledge: this.knowledge })); } catch {}
  }
  restoreFrom(path: string) {
    try {
      if (!existsSync(path)) return;
      const d = JSON.parse(readFileSync(path, "utf8"));
      if (Date.now() - d.at > 45 * 60_000) return;
      for (const u of d.units ?? []) this.units.set(u.id, { ...u, planetId: normDept(u.planetId), lastEventAt: Date.now() });
      for (const e of d.enemies ?? []) this.enemies.set(e.id, e);
      for (const [k, v] of d.stats ?? []) this.planetStats.set(k, v);
      for (const [k, v] of d.offsets ?? []) this.offsets.set(k, v);
      for (const [k, v] of d.sigExample ?? []) this.sigExample.set(k, v);
      if (d.knowledge) this.knowledge = d.knowledge;
      this.research.corrections = d.corrections ?? 0;
      this.log(`Restored ${d.units?.length ?? 0} agents and ${d.enemies?.length ?? 0} blockers`);
    } catch (e) { console.warn("[world] restore failed", e); }
  }

  snapshot(): WorldState {
    const units = [...this.units.values()];
    return {
      now: Date.now(), company: this.cfg.company, planets: this.planets, projects: this.projects, units,
      enemies: [...this.enemies.values()], factories: this.factories, mines: this.mines, research: this.research, knowledge: this.knowledge,
      sunPulse: this.sunPulse, overview: this.overview, feed: this.feed.slice(0, 60), advice: this.advice(), views: this.views, activeViewId: this.activeViewId,
      filter: this.filter, autonomy: this.autonomy, stances: this.stances, simulated: units.some((u) => u.simulated), systemRadius: SYSTEM_R,
      companies: [
        { id: "cc", name: this.cfg.company, agents: units.filter((u) => u.status !== "dead").length, blockers: [...this.enemies.values()].filter((e) => !e.resolved).length, live: true },
        { id: "acme", name: "Acme Robotics", agents: 42, blockers: 3, live: false },
        { id: "lumen", name: "Lumen Health", agents: 17, blockers: 1, live: false },
      ],
    };
  }
}
