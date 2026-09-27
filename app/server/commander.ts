// S3 Brains: the commander (natural language → Commands) and strategy advice.
import { readFileSync } from "node:fs";
import type { Advice, Command, DeptId, HideFilter, Tier, View } from "../shared/types";
import type { Ctx } from "./plugin";
import { claudeJson } from "./llm";

const DEPTS: DeptId[] = ["engineering", "product", "design", "marketing", "operations"];
const TIERS: Tier[] = ["haiku", "sonnet", "opus", "fable", "river", "unknown"];
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

let COMMAND_TYPES = "";
try {
  const src = readFileSync(new URL("../shared/types.ts", import.meta.url), "utf8");
  const m = src.match(/export type Command =[\s\S]*?;\n/);
  if (m) COMMAND_TYPES = m[0];
} catch {}

export function digest(ctx: Ctx, maxUnits = 40): string {
  const w = ctx.world;
  const s = w.snapshot();
  const planets = s.planets.map((p) => `${p.id} (${p.name}, ${p.knowledge} memory pages)`).join("; ");
  const units = s.units.filter((u) => u.status !== "dead").slice(0, maxUnits).map((u) =>
    `- ${u.id} ${u.label} planet=${u.planetId} project=${u.projectId} tier=${u.tier} status=${u.status}${u.groups.length ? ` groups=${u.groups.join("/")}` : ""}${u.blockedBy ? ` blockedBy=${u.blockedBy}` : ""}${u.attacking ? ` attacking=${u.attacking}` : ""}${u.summary ? ` summary="${clip(u.summary, 140)}"` : u.task ? ` task="${clip(u.task, 100)}"` : ""}`).join("\n");
  const enemies = s.enemies.filter((e) => !e.resolved).map((e) =>
    `- ${e.id} "${e.title}" kind=${e.kind} quadrant=${e.quadrant}${e.humanOnly ? " NEEDS-A-PERSON" : ""} blocked=${e.blocked.length} [${e.blocked.join(",")}] attackers=${e.attackers.length} depts=${e.planetIds.join(",")}`).join("\n");
  const factories = s.factories.map((f) => `- ${f.id} "${f.label}" planet=${f.planetId} ${f.paused ? "paused" : "running"} runs=${f.runs}`).join("\n");
  const mines = s.mines.map((m) => `${m.label}: $${m.remaining.toFixed(0)} of $${m.total} left (${Math.round((100 * m.remaining) / (m.total || 1))}%)`).join("; ");
  const projects = s.projects.map((p) => `${p.id}(${p.planetId})`).join(", ");
  return `Planets: ${planets}
Projects: ${projects}
Autonomy: ${s.autonomy}; stances: ${JSON.stringify(s.stances)}; views: ${s.views.map((v) => v.id).join(", ")} (active ${s.activeViewId})
Units (${s.units.length}):
${units || "(none)"}
Enemies (blockers):
${enemies || "(none)"}
Factories:
${factories || "(none)"}
Credits: ${mines}`;
}

const ALLOWED = new Set(["add_view", "set_view", "filter", "spawn", "prompt", "attack", "deploy_for_enemy", "group", "stance", "autonomy", "build_factory", "factory_run"]);
const strArr = (x: any): string[] => (Array.isArray(x) ? x.filter((v) => typeof v === "string") : []);

/** Validate + normalize an LLM-proposed action. Returns null if unusable. */
export function validate(a: any, ctx: Ctx): Command | null {
  if (!a || typeof a !== "object" || !ALLOWED.has(a.type)) return null;
  const w = ctx.world;
  const units = (ids: any) => strArr(ids).filter((id) => w.units.has(id));
  switch (a.type) {
    case "add_view": {
      const v = a.view ?? a;
      const known = (ids: any) => strArr(ids).filter((id) => w.units.has(id) || w.enemies.has(id) || DEPTS.includes(id as DeptId) || w.factories.some((f) => f.id === id) || w.mines.some((m) => m.id === id));
      const view: View = {
        id: typeof v.id === "string" && v.id && v.id !== "default" ? v.id.slice(0, 40) : `cmd-${Date.now().toString(36)}`,
        name: clip(String(v.name ?? "Commander view"), 40), source: "commander",
        highlight: known(v.highlight), hide: known(v.hide), pings: known(v.pings), createdAt: Date.now(),
      };
      return { type: "add_view", view };
    }
    case "set_view": return typeof a.viewId === "string" && (a.viewId === "default" || w.views.some((v) => v.id === a.viewId)) ? { type: "set_view", viewId: a.viewId } : null;
    case "filter": {
      const f = a.filter ?? a;
      const filter: HideFilter = { planets: strArr(f.planets).filter((p) => DEPTS.includes(p as DeptId)) as DeptId[], projects: strArr(f.projects), units: strArr(f.units), enemies: strArr(f.enemies), layers: strArr(f.layers) as any };
      return { type: "filter", filter };
    }
    case "spawn": {
      if (!DEPTS.includes(a.planetId) || typeof a.prompt !== "string" || !a.prompt.trim()) return null;
      return { type: "spawn", planetId: a.planetId, prompt: a.prompt, projectId: typeof a.projectId === "string" ? a.projectId : undefined, tier: TIERS.includes(a.tier) ? a.tier : undefined, name: typeof a.name === "string" ? a.name : undefined };
    }
    case "prompt": { const ids = units(a.unitIds); return ids.length && typeof a.text === "string" && a.text.trim() ? { type: "prompt", unitIds: ids, text: a.text } : null; }
    case "attack": { const ids = units(a.unitIds); return ids.length && w.enemies.has(a.enemyId) ? { type: "attack", enemyId: a.enemyId, unitIds: ids, interrupt: !!a.interrupt } : null; }
    case "deploy_for_enemy": return w.enemies.has(a.enemyId) ? { type: "deploy_for_enemy", enemyId: a.enemyId, tier: TIERS.includes(a.tier) ? a.tier : "sonnet" } : null;
    case "group": { const ids = units(a.unitIds); const g = Number(a.group); return ids.length && g >= 1 && g <= 9 ? { type: "group", unitIds: ids, group: g } : null; }
    case "stance": { const g = Number(a.group); return g >= 1 && g <= 9 && ["hold", "auto_attack", "assist"].includes(a.stance) ? { type: "stance", group: g, stance: a.stance } : null; }
    case "autonomy": return ["manual", "assist", "auto"].includes(a.level) ? { type: "autonomy", level: a.level } : null;
    case "build_factory": return DEPTS.includes(a.planetId) && typeof a.prompt === "string" ? { type: "build_factory", planetId: a.planetId, label: clip(String(a.label ?? "Factory"), 40), prompt: a.prompt, cadenceMs: Math.max(60_000, Number(a.cadenceMs) || 3_600_000) } : null;
    case "factory_run": return w.factories.some((f) => f.id === a.factoryId) ? { type: "factory_run", factoryId: a.factoryId } : null;
  }
  return null;
}

let busy = false;
export async function runCommander(text: string, ctx: Ctx): Promise<void> {
  if (busy) { ctx.broadcast({ type: "commander", text: "Still working on the previous order…" }); return; }
  busy = true;
  try {
    const prompt = `You are the command bar of "C&C", a tool a founder uses to run a company of Claude Code agents. It is NOT a game.
Vocabulary for your reply: teams (Engineering, Product, Design, Marketing, Operations), agents, blockers (NEEDS-A-PERSON ones need the founder — never send agents to those), recurring jobs, credits. Never say planets, units, enemies, gold, mines, or ships. Answer questions about what is going on in 1–3 plain sentences grounded ONLY in the world state; take actions only when asked.

WORLD STATE:
${digest(ctx)}

COMMAND TYPES (TypeScript):
${COMMAND_TYPES || "(spawn, prompt, attack, deploy_for_enemy, group, stance, autonomy, add_view, set_view, filter, build_factory, factory_run)"}

Allowed action types: add_view, set_view, filter, spawn, prompt, attack, deploy_for_enemy, group, stance, autonomy, build_factory, factory_run.
For "show me X" requests use add_view with view {id, name, highlight:[entity ids], hide:[entity ids to hide, optional], pings:[entity ids]}; ids are unit ids, enemy ids, or planet ids from WORLD STATE. Only use ids that exist.
Prefer the fewest actions that achieve the order. If nothing should be done, return an empty actions list and answer in reply.

FOUNDER'S ORDER: ${text}

Reply with ONLY strict JSON: {"reply":"<=40 words, confident RTS-officer voice","actions":[<Command objects>]}`;
    let j: any = await claudeJson(prompt, { model: "haiku", timeoutMs: 40_000, noCache: true, urgent: true });
    if (!j) j = await claudeJson(prompt, { model: "sonnet", timeoutMs: 75_000, noCache: true, urgent: true });
    if (!j) { ctx.broadcast({ type: "commander", text: "Commander offline (LLM call failed). Try again." }); return; }
    const done: string[] = [], skipped: string[] = [];
    for (const raw of (Array.isArray(j.actions) ? j.actions : []).slice(0, 12)) {
      const cmd = validate(raw, ctx);
      if (!cmd) { skipped.push(String(raw?.type ?? "?")); continue; }
      try {
        const r = await ctx.command(cmd);
        done.push(`${r.ok ? "✓" : "✗"} ${describe(cmd)}${r.message ? ` (${clip(r.message, 60)})` : ""}`);
      } catch (e: any) { done.push(`✗ ${describe(cmd)} (${e?.message ?? e})`); }
    }
    const reply = String(j.reply ?? "Orders received.");
    const tail = [...done, ...(skipped.length ? [`skipped invalid: ${skipped.join(", ")}`] : [])];
    ctx.world.log(`⌘ Commander: ${clip(reply, 80)}`);
    ctx.broadcast({ type: "commander", text: tail.length ? `${reply}\n${tail.join("\n")}` : reply });
  } catch (e: any) {
    ctx.broadcast({ type: "commander", text: `Commander error: ${e?.message ?? e}` });
  } finally { busy = false; }
}

function describe(c: Command): string {
  switch (c.type) {
    case "add_view": return `view “${c.view.name}” (${c.view.highlight.length} highlighted)`;
    case "spawn": return `spawn on ${c.planetId}: ${clip(c.prompt, 40)}`;
    case "prompt": return `prompt ${c.unitIds.length} agent(s)`;
    case "attack": return `attack ${c.enemyId} with ${c.unitIds.length}`;
    case "deploy_for_enemy": return `deploy ${c.tier} for ${c.enemyId}`;
    case "group": return `group ${c.group} ← ${c.unitIds.length}`;
    case "stance": return `group ${c.group} stance ${c.stance}`;
    case "autonomy": return `autonomy ${c.level}`;
    case "build_factory": return `factory “${c.label}” on ${c.planetId}`;
    default: return c.type;
  }
}

/** ≤3 RTS-style one-liners → world.extraAdvice. */
let adviceBusy = false;
export async function refreshAdvice(ctx: Ctx): Promise<void> {
  if (adviceBusy) return; adviceBusy = true;
  try {
    const prompt = `You advise a founder running an RTS-style command center of AI agents (planets=departments, units=agents, enemies=blockers, factories=recurring jobs).
WORLD STATE:
${digest(ctx, 30)}

Give at most 3 one-line suggestions for the founder (<=10 words each), e.g. "Marketing idle: expand to TikTok", "Make PR triage a recurring job", "Nobody is exploring new work". Use: teams, agents, blockers, recurring jobs, credits (never planets/units/enemies/gold/mines). Prioritize what unblocks the most or grows the company. Base every suggestion strictly on facts in WORLD STATE; never invent problems (e.g. only mention credits if a budget is below 20%). Do not repeat blockers that need a person; those are already shown.
Reply ONLY strict JSON: {"suggestions":[{"text":"...","priority":2-6}]}`;
    const j: any = await claudeJson(prompt, { model: "haiku", timeoutMs: 90_000, noCache: true });
    const list = Array.isArray(j?.suggestions) ? j.suggestions : [];
    if (!list.length) return;
    const advice: Advice[] = list.slice(0, 3).filter((s: any) => typeof s?.text === "string" && s.text.trim()).map((s: any, i: number) => ({
      id: `llm:${i}`, text: `✦ ${clip(s.text.trim(), 70)}`, priority: Math.max(2, Math.min(6, Math.round(Number(s.priority) || 4))),
    }));
    ctx.world.extraAdvice.splice(0, ctx.world.extraAdvice.length, ...ctx.world.extraAdvice.filter((a) => !a.id.startsWith("llm:")), ...advice);
  } finally { adviceBusy = false; }
}
