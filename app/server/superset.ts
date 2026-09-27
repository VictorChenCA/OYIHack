// S4: Superset CLI wrapper (spawn / prompt / attack / deploy_for_enemy / resolve).
// The CLI auto-loads .env from its cwd and the repo .env holds a placeholder SUPERSET_API_KEY, so we always run it
// from the OS temp dir and strip SUPERSET_API_KEY unless it looks like a real key.
import { tmpdir } from "node:os";
import type { CommandResult, DeptId, Enemy, HookEvent, PermissionMode, Tier } from "../shared/types";
import type { Ctx } from "./plugin";

export const TIER_MODEL: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-5",
  fable: "claude-fable-5-1",
};

export interface SsResult { ok: boolean; json?: any; out: string; err: string }

let ctxRef: Ctx | undefined;
export function initSuperset(ctx: Ctx) { ctxRef = ctx; }

function ssEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  delete env.SUPERSET_API_KEY;
  const key = ctxRef?.env("SUPERSET_API_KEY");
  if (key && /^sk_live_[A-Za-z0-9_-]{16,}$/.test(key)) env.SUPERSET_API_KEY = key;
  return env;
}

/** Run `superset <args> --json`. Never throws. */
export async function ss(args: string[], timeoutMs = 45_000): Promise<SsResult> {
  try {
    const proc = Bun.spawn(["superset", ...args, "--json"], { cwd: tmpdir(), env: ssEnv(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const timer = setTimeout(() => { try { proc.kill(); } catch {} }, timeoutMs);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited; clearTimeout(timer);
    let json: any; try { json = JSON.parse(out); } catch { const m = out.match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (m) try { json = JSON.parse(m[0]); } catch {} }
    return { ok: code === 0, json, out, err: (err || (code !== 0 ? out : "")).trim() };
  } catch (e: any) {
    return { ok: false, out: "", err: String(e?.message ?? e) };
  }
}

// ---------- readiness ----------
let ready: { ok: boolean; why: string; at: number } | undefined;
export async function supersetReady(force = false): Promise<{ ok: boolean; why: string }> {
  if (!force && ready && Date.now() - ready.at < (ready.ok ? 120_000 : 15_000)) return ready;
  const r = await ss(["auth", "whoami"], 10_000);
  const why = r.ok ? "" : (r.err.split("\n")[0] || "superset CLI unavailable").replace(/^Error:\s*/, "").replace(/sk_live_\S+/g, "sk_live_***");
  ready = { ok: r.ok, why, at: Date.now() };
  return ready;
}
const notReady = (why: string): CommandResult => ({ ok: false, message: `Superset not ready: ${why}. Run \`superset auth login\` (and \`superset start\`) on this machine.` });

// ---------- project ----------
let projectCache: string | undefined;
export async function projectId(ctx: Ctx): Promise<string | undefined> {
  if (ctx.cfg.supersetProjectId) return ctx.cfg.supersetProjectId;
  if (projectCache) return projectCache;
  const r = await ss(["projects", "list", "--local"], 20_000);
  if (!r.ok || !r.json) return undefined;
  const list: any[] = Array.isArray(r.json) ? r.json : r.json.projects ?? r.json.data ?? r.json.items ?? [];
  const root = ctx.cfg.repoRoot.replace(/\/$/, "");
  const hit = list.find((p) => JSON.stringify(p).includes(root)) ?? list.find((p) => /oyihack/i.test(JSON.stringify(p))) ?? (list.length === 1 ? list[0] : undefined);
  projectCache = hit?.id ?? hit?.projectId;
  return projectCache;
}

// ---------- helpers ----------
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").split("-").filter(Boolean).slice(0, 4).join("-").slice(0, 28).replace(/-+$/, "") || "task";
const rand4 = () => Math.random().toString(36).slice(2, 6).padEnd(4, "0");

function preamble(ctx: Ctx, planetId: DeptId, projectId?: string) {
  const planet = ctx.cfg.planets.find((p) => p.id === planetId);
  const project = ctx.cfg.projects.find((p) => p.id === projectId) ?? ctx.cfg.projects.find((p) => p.planetId === planetId);
  const dept = planetId === "product_design" ? "product-design" : planetId;
  return `You are an agent in C&C (Command and Control) on the ${planet?.name ?? planetId} team, project ${project?.name ?? projectId ?? "general"}. ` +
    `Before starting, search GBrain (gbrain-cloud MCP) for relevant company memory. ` +
    `When you finish, remember your key result in GBrain under company/${dept}/... with provenance. ` +
    `If you're blocked on something only a human can do (a key, an account signup, a payment, an approval), stop and state exactly what you need in one line.\n\n`;
}

export interface SpawnArgs { planetId: DeptId; prompt: string; projectId?: string; tier?: Tier; name?: string; permissionMode?: PermissionMode }
export interface SpawnOut { name: string; workspaceId?: string; terminalId?: string }

/** Pending "set attacking on arrival" for deploy_for_enemy. */
const pendingAttack: { name: string; workspaceId?: string; enemyId: string; at: number }[] = [];

export async function spawnUnit(ctx: Ctx, a: SpawnArgs): Promise<CommandResult & { spawn?: SpawnOut }> {
  const rd = await supersetReady(); if (!rd.ok) return notReady(rd.why);
  const pid = a.projectId && /^[0-9a-f-]{20,}$/i.test(a.projectId) ? a.projectId : await projectId(ctx);
  if (!pid) return { ok: false, message: "Superset not ready: no Superset project for this repo (set supersetProjectId in config.json or `superset projects create`)" };
  const planet = ctx.cfg.planets.find((p) => p.id === a.planetId);
  const prefix = planet?.prefix[0] ?? "eng-";
  const name = `${prefix}${slugify(a.name || a.prompt)}-${rand4()}`;
  const model = a.tier ? TIER_MODEL[a.tier] : undefined;
  const full = preamble(ctx, a.planetId, a.projectId) + a.prompt;
  const args = ["ws", "create", "--local", "--project", pid, "--name", name, "--branch", name];
  if (a.permissionMode && a.permissionMode !== "default" && a.permissionMode !== "unknown") {
    // No --permission-mode on `ws create --agent`; launch claude ourselves via --command (single-quoted, POSIX-safe).
    args.push("--command", `claude --permission-mode ${a.permissionMode}${model ? ` --model ${model}` : ""} ${shq(full)}`);
  } else {
    args.push("--agent", "claude", "--prompt", full);
    if (model) args.push("--model", model);
  }
  const r = await ss(args, 90_000);
  if (!r.ok) return { ok: false, message: `Superset spawn failed: ${(r.err || "unknown error").split("\n")[0].slice(0, 200)}` };
  const j = r.json ?? {};
  const workspaceId: string | undefined = j.workspace?.id ?? j.workspaceId ?? j.id;
  let terminalId: string | undefined = j.agents?.find((x: any) => x?.ok !== false)?.sessionId ?? j.terminals?.[0]?.terminalId ?? j.terminals?.[0]?.id;
  if (!terminalId && workspaceId) terminalId = await agentTerminal(workspaceId);
  const projectTag = a.projectId && ctx.cfg.projects.some((p) => p.id === a.projectId) ? a.projectId : undefined;
  ctx.world.registerSpawn({ name, planetId: a.planetId, projectId: projectTag, tier: a.tier, permissionMode: a.permissionMode, workspaceId, terminalId });
  ctx.world.log(`⇡ Deployed ${name} to ${planet?.name ?? a.planetId}${a.tier ? ` (${a.tier})` : ""}`);
  return { ok: true, message: `Deployed ${name}`, data: { name, workspaceId, terminalId }, spawn: { name, workspaceId, terminalId } };
}

async function agentTerminal(workspaceId: string): Promise<string | undefined> {
  const r = await ss(["terminals", "list", "--local", "--workspace", workspaceId], 20_000);
  if (!r.ok || !r.json) return undefined;
  const list: any[] = Array.isArray(r.json) ? r.json : r.json.terminals ?? r.json.data ?? [];
  const t = list.find((x) => /claude|agent/i.test(JSON.stringify(x))) ?? list[0];
  return t?.terminalId ?? t?.id ?? t?.sessionId;
}

/** Send text to a unit's Superset terminal. Returns an error string or undefined on success. */
export async function sendToUnit(ctx: Ctx, unitId: string, text: string): Promise<string | undefined> {
  const u = ctx.world.units.get(unitId);
  if (!u) return `${unitId.slice(0, 8)}: unit not found`;
  const target = u.parentId ? ctx.world.units.get(u.parentId) ?? u : u; // subagents are prompted via their mothership's terminal
  if (!target.workspaceId) return `${u.label}: not launched from C&C/Superset (no workspace to prompt)`;
  if (!target.terminalId) { const t = await agentTerminal(target.workspaceId); if (t) ctx.world.attach(target.id, undefined, t); }
  if (!target.terminalId) return `${u.label}: no agent terminal found in workspace`;
  const r = await ss(["terminals", "send", "--local", "--workspace", target.workspaceId, "--terminal", target.terminalId, "--text", text], 20_000);
  return r.ok ? undefined : `${u.label}: ${(r.err || "send failed").split("\n")[0].slice(0, 160)}`;
}

async function promptUnits(ctx: Ctx, unitIds: string[], text: string): Promise<CommandResult> {
  if (!unitIds.length) return { ok: false, message: "No agents selected" };
  const anyWs = unitIds.some((id) => { const u = ctx.world.units.get(id); return u && (u.workspaceId || (u.parentId && ctx.world.units.get(u.parentId)?.workspaceId)); });
  if (anyWs) { const rd = await supersetReady(); if (!rd.ok) return notReady(rd.why); }
  const errs = (await Promise.all(unitIds.map((id) => sendToUnit(ctx, id, text)))).filter(Boolean) as string[];
  const sent = unitIds.length - errs.length;
  if (!sent) return { ok: false, message: errs.join(" · ") };
  return { ok: true, message: `Sent to ${sent} agent${sent === 1 ? "" : "s"}${errs.length ? ` (${errs.length} skipped: ${errs[0]})` : ""}` };
}

const blockerText = (e: Enemy) => `Take on this blocker for the team: ${e.title}. Context: ${e.reason}. Resolve it if you can; if it truly needs a human, reply with exactly what's needed.`;

function markAttacking(ctx: Ctx, unitId: string, e: Enemy) {
  const u = ctx.world.units.get(unitId); if (!u) return;
  u.attacking = e.id; u.status = "attacking";
  if (!e.attackers.includes(u.id)) e.attackers.push(u.id);
}

export async function handleSupersetCommand(cmd: any, ctx: Ctx): Promise<CommandResult | undefined> {
  switch (cmd.type) {
    case "spawn": {
      const r = await spawnUnit(ctx, cmd);
      const { spawn: _s, ...rest } = r; return rest;
    }
    case "prompt": return promptUnits(ctx, cmd.unitIds ?? [], cmd.text ?? "");
    case "attack": {
      const e = ctx.world.enemies.get(cmd.enemyId);
      if (!e) return { ok: false, message: "Enemy not found (already cleared?)" };
      const ids: string[] = (cmd.unitIds ?? []).filter((id: string) => ctx.world.units.has(id));
      if (!ids.length) return { ok: false, message: "No agents selected" };
      for (const id of ids) markAttacking(ctx, id, e);
      ctx.world.log(`→ ${ids.length} agent${ids.length === 1 ? "" : "s"} → ${e.title}`, { enemyId: e.id });
      const text = (cmd.interrupt ? "[Interrupt from the commander] " : "") + blockerText(e);
      const sim = ids.every((id) => ctx.world.units.get(id)?.simulated);
      if (sim) return { ok: true, message: `Sent to ${e.title} (simulated agents)` };
      const r = await promptUnits(ctx, ids, text);
      return { ok: true, message: `Sent to “${e.title}”: ${r.message}` };
    }
    case "deploy_for_enemy": {
      const e = ctx.world.enemies.get(cmd.enemyId);
      if (!e) return { ok: false, message: "Enemy not found (already cleared?)" };
      const planetId = (e.planetIds[0] ?? "engineering") as DeptId;
      const r = await spawnUnit(ctx, { planetId, prompt: blockerText(e), tier: cmd.tier, name: `fix ${e.title}` });
      if (!r.ok || !r.spawn) return { ok: r.ok, message: r.message };
      pendingAttack.push({ name: r.spawn.name, workspaceId: r.spawn.workspaceId, enemyId: e.id, at: Date.now() });
      return { ok: true, message: `Deploying ${r.spawn.name} against “${e.title}”`, data: r.data };
    }
    case "resolve": {
      const e = ctx.world.enemies.get(cmd.enemyId);
      if (!e) return { ok: false, message: "Enemy not found (already cleared?)" };
      const attackers = [...e.attackers];
      const ids = ctx.world.resolveEnemy(cmd.enemyId, cmd.note);
      const text = `Unblocked: ${cmd.note || "resolved by the commander"}. Continue your task.`;
      const targets = [...new Set([...ids, ...attackers])].filter((id) => { const u = ctx.world.units.get(id); return u && !u.simulated && (u.workspaceId || u.terminalId); });
      if (!targets.length) return { ok: true, message: `Resolved “${e.title}” (${ids.length} agent${ids.length === 1 ? "" : "s"} unblocked)` };
      const rd = await supersetReady();
      if (!rd.ok) return { ok: true, message: `Resolved “${e.title}”; couldn't notify agents (Superset not ready: ${rd.why})` };
      const errs = (await Promise.all(targets.map((id) => sendToUnit(ctx, id, text)))).filter(Boolean);
      return { ok: true, message: `Resolved “${e.title}”: notified ${targets.length - errs.length}/${targets.length} agent(s)` };
    }
  }
  return undefined;
}

/** deploy_for_enemy: when the spawned unit's first hook arrives, set it attacking. */
export function supersetOnHook(ev: HookEvent, ctx: Ctx) {
  if (!pendingAttack.length) return;
  const now = Date.now();
  for (let i = pendingAttack.length - 1; i >= 0; i--) {
    const p = pendingAttack[i];
    if (now - p.at > 15 * 60_000) { pendingAttack.splice(i, 1); continue; }
    const match = (ev.cwd ?? "").includes(p.name) || (p.workspaceId && ev._workspaceId === p.workspaceId);
    if (!match) continue;
    const e = ctx.world.enemies.get(p.enemyId); const u = ctx.world.units.get(ev.session_id);
    if (u && e && !e.resolved) { markAttacking(ctx, u.id, e); ctx.world.log(`→ ${u.label} engaging “${e.title}”`, { enemyId: e.id, unitId: u.id }); }
    pendingAttack.splice(i, 1);
  }
}
