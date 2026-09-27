// Company to-dos (company/todos.md) → to-do blockers in their team. Real file, reloaded on change; "Mark done" checks the box.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { DeptId, Enemy, Quadrant } from "../shared/types";
import type { Ctx } from "./plugin";

let mtime = -1;
const idOf = (title: string) => `todo-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
const TEAMS = new Set(["engineering", "product", "design", "marketing", "operations"]);

function parse(md: string) {
  const out: { done: boolean; title: string; team: DeptId; owner?: string; due?: number; q: Quadrant; person: boolean }[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^- \[( |x|X)\] (.+)$/); if (!m) continue;
    const parts = m[2].split(" · ").map((x) => x.trim());
    const title = parts[0]; const kv: Record<string, string> = {}; let person = false;
    for (const p of parts.slice(1)) { const i = p.indexOf(":"); if (i > 0) kv[p.slice(0, i)] = p.slice(i + 1); else if (p === "person") person = true; }
    const team = (TEAMS.has(kv.team) ? kv.team : "operations") as DeptId;
    let due: number | undefined;
    if (kv.due) { const [h, mm] = kv.due.split(":").map(Number); const d = new Date(); d.setHours(h, mm || 0, 0, 0); due = d.getTime(); }
    const q = (["do_now", "schedule", "delegate", "drop"].includes(kv.type) ? kv.type : "schedule") as Quadrant;
    out.push({ done: m[1] !== " ", title, team, owner: kv.owner, due, q, person });
  }
  return out;
}

export function syncTodos(ctx: Ctx) {
  const path = `${ctx.cfg.repoRoot}/company/todos.md`;
  if (!existsSync(path)) return;
  const mt = statSync(path).mtimeMs; if (mt === mtime) return; mtime = mt;
  const items = parse(readFileSync(path, "utf8"));
  const w = ctx.world;
  for (const it of items) {
    const id = idOf(it.title);
    const existing = w.enemies.get(id);
    if (it.done) { if (existing && !existing.defeatedAt) { existing.defeatedAt = Date.now(); existing.resolved = true; } continue; }
    // overdue to-dos escalate to do_now
    const q: Quadrant = it.due && it.due < Date.now() ? "do_now" : it.q;
    const e: Enemy = existing ?? {
      id, causeKey: `todo:${id}`, title: it.title, reason: it.person ? "Needs a person" : "An agent can take this", kind: "todo", quadrant: q, humanOnly: it.person,
      blocked: [], attackers: [], strength: 1, createdAt: Date.now(), planetIds: [it.team], pos: { x: 0, y: 0 }, owner: it.owner, due: it.due, source: "company/todos.md",
    };
    Object.assign(e, { title: it.title, quadrant: q, humanOnly: it.person, planetIds: [it.team], owner: it.owner, due: it.due, defeatedAt: undefined, resolved: false });
    w.enemies.set(id, e);
  }
}

/** Mark a to-do done in the file (so it persists and reviewers see it in the repo). */
export function completeTodo(ctx: Ctx, enemyId: string): boolean {
  const path = `${ctx.cfg.repoRoot}/company/todos.md`; if (!existsSync(path)) return false;
  const lines = readFileSync(path, "utf8").split("\n"); let hit = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[ \] (.+)$/); if (!m) continue;
    if (idOf(m[1].split(" · ")[0].trim()) === enemyId) { lines[i] = lines[i].replace("- [ ]", "- [x]"); hit = true; }
  }
  if (hit) { writeFileSync(path, lines.join("\n")); mtime = -1; }
  return hit;
}
