// After-action report: live WorldState + a replay of data/events.jsonl through the real world reducer
// → one self-contained static page (app/report/index.html). Optional --publish to a Superset Page.
//
// Usage (from app/):
//   bun scripts/report.ts                         # fetch http://localhost:7777/api/state + data/events.jsonl
//   bun scripts/report.ts --url http://localhost:7793 --out report/index.html
//   bun scripts/report.ts --publish               # also: superset pages publish … --visibility everyone
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { AppConfig } from "../server/plugin";
import type { DeptId, Enemy, HookEvent, Mine, Planet, Quadrant, Unit, WorldState, EnemyKind } from "../shared/types";
import { World } from "../server/world";

const APP = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const URL_ = opt("url") ?? process.env.CC_URL ?? "http://localhost:7777";
const OUT = resolve(APP, opt("out") ?? "report/index.html");
const EVENTS = resolve(APP, opt("events") ?? "data/events.jsonl");
const TITLE = "C&C after-action report";

// ---------------- inputs ----------------
const cfg: AppConfig = JSON.parse(readFileSync(resolve(APP, "config.json"), "utf8"));
let live: WorldState | null = null;
try { const r = await fetch(`${URL_}/api/state`, { signal: AbortSignal.timeout(3000) }); if (r.ok) live = (await r.json()) as WorldState; } catch {}
const events: HookEvent[] = existsSync(EVENTS)
  ? readFileSync(EVENTS, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e): e is HookEvent => !!e?.hook_event_name && !!e.session_id)
  : [];
events.sort((a, b) => (a._ts ?? 0) - (b._ts ?? 0));
const readJson = (p: string) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; } catch { return null; } };
const card = readJson(resolve(APP, opt("card") ?? "river/card.json")) ?? live?.research?.card ?? null;
const evalJson = readJson(resolve(APP, "river/eval.json"));

// ---------------- replay through the real reducer (clock patched to event time) ----------------
interface EnemyRec { id: string; title: string; reason: string; kind: EnemyKind; quadrant: Quadrant; humanOnly: boolean; createdAt: number; resolvedAt?: number; planetIds: DeptId[]; maxBlocked: number; simulated?: boolean }
interface Tl { at: number; text: string; level?: string; unitId?: string; enemyId?: string }
const DUR = resolve(APP, "data/durations.json");
const durBackup = existsSync(DUR) ? readFileSync(DUR, "utf8") : null;
const realNow = Date.now;
let clock = events[0]?._ts ?? realNow();
Date.now = () => clock;
const world = new World(cfg);
world.durations = {}; // replay from a blank history so charted/frontier is as-it-happened
const timeline: Tl[] = [];
world.log = (text: string, extra: Partial<Tl> = {}) => { timeline.push({ at: clock, text, ...extra }); };
const enemies = new Map<string, EnemyRec>();
const sessPlanet = new Map<string, DeptId>();
const motherships = new Set<string>(), subagents = new Set<string>(), realSessions = new Set<string>();
const perPlanet = new Map<DeptId, { units: Set<string>; subs: Set<string>; tools: number; fails: number; memW: number; memR: number; tasks: Map<string, number>; charted: number; frontier: number }>();
const P = (id: DeptId) => { let s = perPlanet.get(id); if (!s) perPlanet.set(id, (s = { units: new Set(), subs: new Set(), tools: 0, fails: 0, memW: 0, memR: 0, tasks: new Map(), charted: 0, frontier: 0 })); return s; };
let toolCalls = 0, toolFails = 0, simEvents = 0, charted = 0, frontier = 0, memWrites = 0, memReads = 0;
const t0 = events[0]?._ts ?? realNow(), t1 = events.at(-1)?._ts ?? realNow();
const BUCKETS = 48, span = Math.max(60_000, t1 - t0);
const activity = new Map<DeptId, number[]>();
const bucketOf = (t: number) => Math.min(BUCKETS - 1, Math.floor(((t - t0) / span) * BUCKETS));
let lastTick = clock;
const scanEnemies = () => {
  for (const e of world.enemies.values()) {
    let r = enemies.get(e.id);
    if (!r) enemies.set(e.id, (r = { id: e.id, title: e.title, reason: e.reason, kind: e.kind, quadrant: e.quadrant, humanOnly: e.humanOnly, createdAt: e.createdAt, planetIds: [...e.planetIds], maxBlocked: 0, simulated: e.simulated }));
    r.quadrant = e.quadrant; r.humanOnly = e.humanOnly; r.kind = e.kind; r.planetIds = [...new Set([...r.planetIds, ...e.planetIds])];
    r.maxBlocked = Math.max(r.maxBlocked, e.blocked.length);
    if (e.resolved && !r.resolvedAt) r.resolvedAt = clock;
  }
};
for (const ev of events) {
  clock = ev._ts ?? clock;
  while (clock - lastTick > 2000) { lastTick += 2000; const c = clock; clock = lastTick; world.tick(lastTick); scanEnemies(); clock = c; }
  if (ev._simulated) simEvents++; else realSessions.add(ev.session_id);
  world.handle(ev);
  const mother = world.units.get(ev.session_id);
  const planet = mother?.planetId ?? sessPlanet.get(ev.session_id) ?? "engineering";
  sessPlanet.set(ev.session_id, planet);
  const st = P(planet);
  motherships.add(ev.session_id); st.units.add(ev.session_id);
  if (ev.agent_id) { subagents.add(`${ev.session_id}:${ev.agent_id}`); st.subs.add(`${ev.session_id}:${ev.agent_id}`); }
  if (ev.hook_event_name === "PreToolUse") {
    toolCalls++; st.tools++;
    const a = activity.get(planet) ?? Array(BUCKETS).fill(0); a[bucketOf(clock)]++; activity.set(planet, a);
    const m = (ev.tool_name ?? "").match(/^mcp__gbrain[\w-]*__(\w+)/);
    if (m) { if (/remember|put_page|add_link|capture|forget/.test(m[1])) { memWrites++; st.memW++; } else { memReads++; st.memR++; } }
  }
  if (ev.hook_event_name === "PostToolUseFailure") { toolFails++; st.fails++; }
  if (ev.hook_event_name === "UserPromptSubmit" && !/^unblocked/i.test(ev.prompt ?? "")) {
    const u = world.units.get(ev.session_id);
    if (u?.charted) { charted++; st.charted++; } else { frontier++; st.frontier++; }
    const task = (ev.prompt ?? "").split("\n")[0].slice(0, 90);
    st.tasks.set(task, (st.tasks.get(task) ?? 0) + 1);
  }
  scanEnemies();
}
for (let i = 0; i < 4; i++) { lastTick += 2000; clock = lastTick; world.tick(lastTick); scanEnemies(); }
Date.now = realNow;
if (durBackup !== null) writeFileSync(DUR, durBackup);
const replayState = world.snapshot();

// ---------------- metrics ----------------
const S: WorldState = live ?? replayState;
const ens = [...enemies.values()];
const cleared = ens.filter((e) => e.resolvedAt), open = ens.filter((e) => !e.resolvedAt);
const gold = ens.filter((e) => e.humanOnly), goldCleared = gold.filter((e) => e.resolvedAt);
const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const ttr = med(cleared.map((e) => e.resolvedAt! - e.createdAt));
const goldTtr = med(goldCleared.map((e) => e.resolvedAt! - e.createdAt));
const mines: Mine[] = S.mines ?? [];
const spend = mines.map((m) => ({ ...m, spent: Math.max(0, m.total - m.remaining) }));
const liveCost = (live?.units ?? []).reduce((a, u) => a + (u.costUsd || 0), 0);
const simShare = events.length ? simEvents / events.length : 0;

// ---------------- helpers ----------------
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtDur = (ms: number | null) => ms == null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : ms < 3_600_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 3_600_000).toFixed(1)}h`;
const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Los_Angeles" });
const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;
const QC: Record<Quadrant, string> = { do_now: "#FF4D4D", schedule: "#FFB020", delegate: "#A774FF", drop: "#8A8F98" };
const QL: Record<Quadrant, string> = { do_now: "Do now", schedule: "Schedule", delegate: "Delegate", drop: "Drop" };
const GOLD = "#FFD24A";
const planets: Planet[] = S.planets;
const pColor = (id: DeptId) => planets.find((p) => p.id === id)?.color ?? "#4FD1FF";
const pName = (id: DeptId) => planets.find((p) => p.id === id)?.name ?? id;
const projColor = (id: string) => S.projects.find((p) => p.id === id)?.color ?? "#9fb3c8";

// ---------------- solar system SVG ----------------
function systemSvg(): string {
  const R = S.systemRadius || 1450, pad = 150;
  const units = S.units.filter((u) => !u.hidden && u.status !== "dead");
  const byId = new Map(units.map((u) => [u.id, u]));
  const es = S.enemies.filter((e) => !e.resolved && !e.hidden);
  const out: string[] = [];
  out.push(`<svg viewBox="${-R - pad} ${-R - pad} ${2 * (R + pad)} ${2 * (R + pad)}" class="map" role="img" aria-label="Solar system snapshot">`);
  out.push(`<defs><radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff8e1"/><stop offset=".35" stop-color="#FFD166"/><stop offset=".7" stop-color="#ff9f1c" stop-opacity=".55"/><stop offset="1" stop-color="#ff9f1c" stop-opacity="0"/></radialGradient>
  <radialGradient id="neb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0d2238"/><stop offset=".6" stop-color="#070d19"/><stop offset="1" stop-color="#03060c"/></radialGradient>
  <radialGradient id="fog" cx="50%" cy="50%" r="50%"><stop offset=".72" stop-color="#8fb3ff" stop-opacity="0"/><stop offset="1" stop-color="#8fb3ff" stop-opacity=".10"/></radialGradient></defs>`);
  out.push(`<circle r="${R + pad}" fill="url(#neb)"/>`);
  // stars (deterministic)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 220; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * (R + pad); out.push(`<circle cx="${(Math.cos(a) * r).toFixed(0)}" cy="${(Math.sin(a) * r).toFixed(0)}" r="${(rnd() * 2.2 + 0.4).toFixed(1)}" fill="#cfe3ff" opacity="${(rnd() * 0.6 + 0.15).toFixed(2)}"/>`); }
  out.push(`<circle r="${R}" fill="url(#fog)"/><circle r="${(R * 0.78).toFixed(0)}" fill="none" stroke="#8fb3ff" stroke-opacity=".18" stroke-dasharray="6 14" stroke-width="3"/>`);
  out.push(`<circle r="${R}" fill="none" stroke="#4FD1FF" stroke-opacity=".25" stroke-width="2"/>`);
  // orbits + cycle-end markers + beams
  for (const p of planets) {
    out.push(`<circle r="${p.orbitRadius}" fill="none" stroke="${p.color}" stroke-opacity=".22" stroke-width="2"/>`);
    const mx = Math.cos(p.baseAngle) * p.orbitRadius, my = Math.sin(p.baseAngle) * p.orbitRadius;
    out.push(`<line x1="${mx * 0.96}" y1="${my * 0.96}" x2="${mx * 1.04}" y2="${my * 1.04}" stroke="${p.color}" stroke-width="5" opacity=".8"/>`);
    out.push(`<line x1="0" y1="0" x2="${p.pos.x}" y2="${p.pos.y}" stroke="${p.color}" stroke-opacity="${(0.12 + p.memTraffic * 0.6).toFixed(2)}" stroke-width="${3 + p.memTraffic * 6}"/>`);
  }
  // mines
  for (const m of S.mines ?? []) out.push(`<g transform="translate(${m.pos.x} ${m.pos.y})"><polygon points="-36,-13 -13,-36 23,-30 40,3 16,33 -23,30" fill="#1b2433" stroke="${m.color}" stroke-width="3"/><text y="${m.pos.x < -40 ? 80 : m.pos.x > 40 ? 80 : 118}" class="lbl sm" fill="${m.color}">${esc(m.id.toUpperCase())}</text></g>`);
  // research station
  if (S.research?.pos) out.push(`<g transform="translate(${S.research.pos.x} ${S.research.pos.y})"><rect x="-28" y="-28" width="56" height="56" transform="rotate(45)" fill="none" stroke="#40E0D0" stroke-width="3"/><circle r="6" fill="#40E0D0"/><text y="80" class="lbl" fill="#40E0D0">RESEARCH</text></g>`);
  // sun
  out.push(`<circle r="260" fill="url(#sun)" opacity=".55"/><circle r="110" fill="url(#sun)"/><text y="180" class="lbl big" fill="#FFD166">GBRAIN</text>`);
  // planets
  for (const p of planets) {
    const rings = Array.from({ length: p.colonization }, (_, i) => `<circle r="${72 + i * 14}" fill="none" stroke="${p.color}" stroke-opacity="${0.5 - i * 0.12}" stroke-width="2"/>`).join("");
    out.push(`<g transform="translate(${p.pos.x.toFixed(0)} ${p.pos.y.toFixed(0)})">${rings}<circle r="56" fill="${p.color}" fill-opacity=".9"/><circle r="50" fill="#000" fill-opacity=".3" transform="translate(12 -9)"/><text y="-98" class="lbl big" fill="${p.color}">${esc(p.name.toUpperCase())}</text></g>`);
  }
  // tethers + units
  for (const u of units) if (u.parentId && byId.get(u.parentId)) { const pa = byId.get(u.parentId)!; out.push(`<line x1="${u.pos.x.toFixed(0)}" y1="${u.pos.y.toFixed(0)}" x2="${pa.pos.x.toFixed(0)}" y2="${pa.pos.y.toFixed(0)}" stroke="${projColor(u.projectId)}" stroke-opacity=".35" stroke-dasharray="4 6" stroke-width="2"/>`); }
  for (const e of es) for (const id of e.blocked) { const u = byId.get(id); if (u) out.push(`<line x1="${u.pos.x.toFixed(0)}" y1="${u.pos.y.toFixed(0)}" x2="${e.pos.x.toFixed(0)}" y2="${e.pos.y.toFixed(0)}" stroke="${e.humanOnly ? GOLD : QC[e.quadrant]}" stroke-opacity=".45" stroke-dasharray="3 7" stroke-width="2"/>`); }
  for (const u of units) {
    const c = projColor(u.projectId), r = u.role === "mothership" ? 22 : 9;
    const ang = Math.atan2(u.target.y - u.pos.y, u.target.x - u.pos.x) * 180 / Math.PI;
    out.push(u.role === "mothership"
      ? `<g transform="translate(${u.pos.x.toFixed(0)} ${u.pos.y.toFixed(0)}) rotate(${ang.toFixed(0)})"><polygon points="${r * 1.6},0 ${-r},${-r} ${-r * 0.5},0 ${-r},${r}" fill="${c}" stroke="${u.status === "blocked" ? "#FF4D4D" : "#e8f4ff"}" stroke-width="4"/></g>`
      : `<circle cx="${u.pos.x.toFixed(0)}" cy="${u.pos.y.toFixed(0)}" r="${r}" fill="${c}" opacity=".9"/>`);
  }
  // enemies
  for (const e of es) {
    const c = QC[e.quadrant], s = 30 + Math.min(6, e.strength) * 8;
    out.push(`<g transform="translate(${e.pos.x.toFixed(0)} ${e.pos.y.toFixed(0)})">${e.humanOnly ? `<circle r="${s + 12}" fill="none" stroke="${GOLD}" stroke-width="4" opacity=".9"/>` : ""}<polygon points="0,${-s} ${s},0 0,${s} ${-s},0" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="3"/><text y="${s + 56}" class="lbl" fill="${e.humanOnly ? GOLD : c}">${esc(e.title.length > 22 ? e.title.slice(0, 21) + "…" : e.title)}</text></g>`);
  }
  out.push(`</svg>`);
  return out.join("\n");
}

// ---------------- activity swimlanes SVG ----------------
function lanesSvg(): string {
  const W = 1000, laneH = 46, top = 18, H = top + planets.length * laneH + 34;
  const max = Math.max(1, ...[...activity.values()].flat());
  const x = (t: number) => ((t - t0) / span) * W;
  const out: string[] = [`<svg viewBox="-150 0 ${W + 160} ${H}" class="lanes" role="img" aria-label="Activity by planet over time">`];
  planets.forEach((p, i) => {
    const y0 = top + i * laneH, a = activity.get(p.id) ?? Array(BUCKETS).fill(0);
    out.push(`<text x="-12" y="${y0 + laneH / 2 + 4}" text-anchor="end" class="lane-lbl" fill="${p.color}">${esc(p.name)}</text>`);
    out.push(`<line x1="0" x2="${W}" y1="${y0 + laneH - 6}" y2="${y0 + laneH - 6}" stroke="#1d2a3d"/>`);
    const pts = a.map((v, k) => `${((k + 0.5) / BUCKETS) * W},${y0 + laneH - 6 - (v / max) * (laneH - 16)}`);
    out.push(`<polygon points="0,${y0 + laneH - 6} ${pts.join(" ")} ${W},${y0 + laneH - 6}" fill="${p.color}" fill-opacity=".22" stroke="${p.color}" stroke-width="1.5"/>`);
    for (const e of ens.filter((e) => e.planetIds.includes(p.id))) {
      const c = e.humanOnly ? GOLD : QC[e.quadrant];
      out.push(`<rect x="${x(e.createdAt).toFixed(1)}" y="${y0 + laneH - 5}" width="${Math.max(3, x(e.resolvedAt ?? t1) - x(e.createdAt)).toFixed(1)}" height="4" fill="${c}" rx="2"><title>${esc(e.title)} · ${e.resolvedAt ? "cleared in " + fmtDur(e.resolvedAt - e.createdAt) : "open"}</title></rect>`);
    }
  });
  for (let k = 0; k <= 4; k++) { const t = t0 + (span * k) / 4; out.push(`<text x="${(W * k) / 4}" y="${H - 8}" text-anchor="${k === 0 ? "start" : k === 4 ? "end" : "middle"}" class="axis">${fmtTime(t)}</text>`); }
  out.push(`</svg>`);
  return out.join("");
}

// ---------------- River card ----------------
function tableFrom(v: any): string {
  if (Array.isArray(v) && v.length && typeof v[0] === "object") {
    const cols = [...new Set(v.flatMap((r: any) => Object.keys(r)))];
    return `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${v.map((r: any) => `<tr>${cols.map((c) => `<td>${esc(typeof r[c] === "number" ? +r[c].toFixed(3) : typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  if (v && typeof v === "object") {
    const rows = Object.entries(v);
    if (rows.every(([, r]) => r && typeof r === "object" && !Array.isArray(r))) {
      const cols = [...new Set(rows.flatMap(([, r]) => Object.keys(r as any)))];
      return `<table><thead><tr><th></th>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(([k, r]: any) => `<tr><th>${esc(k)}</th>${cols.map((c) => `<td>${esc(typeof r[c] === "number" ? +r[c].toFixed(3) : typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    return `<dl class="kv">${rows.map(([k, r]) => `<dt>${esc(k)}</dt><dd>${esc(typeof r === "object" ? JSON.stringify(r) : r)}</dd>`).join("")}</dl>`;
  }
  return `<p>${esc(v)}</p>`;
}
function riverSection(): string {
  const c = card ?? (evalJson ? { eval: evalJson } : null);
  if (!c) return `<section class="panel river"><h2>River Sentinel</h2><p class="muted">No <code>app/river/card.json</code> yet. When the River run finishes, re-run <code>bun scripts/report.ts</code> and the base-vs-trained table appears here.</p></section>`;
  const table = c.eval_table ?? c.evalTable ?? c.table ?? c.eval ?? evalJson;
  const skip = new Set(["eval_table", "evalTable", "table", "eval", "loss", "loss_curve", "lossCurve", "examples", "steps"]);
  const flat = (v: any) => v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x !== "object") ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(" · ") : v;
  const meta = Object.fromEntries(Object.entries(c).filter(([k, v]) => !skip.has(k)).map(([k, v]) => [k, flat(v)]).filter(([, v]) => typeof v !== "object" || v === null));
  const loss: number[] = (c.loss_curve ?? c.lossCurve ?? c.loss ?? c.steps ?? []).map((s: any) => typeof s === "number" ? s : s?.loss).filter((n: any) => typeof n === "number");
  let spark = "";
  if (loss.length > 1) { const mx = Math.max(...loss), mn = Math.min(...loss); spark = `<svg viewBox="0 0 300 60" class="spark"><polyline fill="none" stroke="#40E0D0" stroke-width="2" points="${loss.map((l, i) => `${(i / (loss.length - 1)) * 300},${56 - ((l - mn) / (mx - mn || 1)) * 52}`).join(" ")}"/></svg><div class="muted small">training loss · ${loss.length} points</div>`; }
  return `<section class="panel river"><h2><span class="gem"></span>River Sentinel · <span class="muted">base vs trained</span></h2>
  <div class="river-grid"><div>${tableFrom(meta)}${spark}</div><div>${table ? tableFrom(table) : ""}</div></div></section>`;
}

// ---------------- page ----------------
const kpi = (label: string, value: string, sub = "", color = "#4FD1FF") => `<div class="kpi" style="--c:${color}"><div class="kv-l">${label}</div><div class="kv-v">${value}</div><div class="kv-s">${sub}</div></div>`;
const bar = (frac: number, color: string) => `<div class="bar"><i style="width:${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%;background:${color}"></i></div>`;
const colonized = new Set<string>();
const notable = timeline.flatMap((t) => {
  const arr = t.text.match(/ arrived at (.+)$/);
  if (arr) { if (colonized.has(arr[1])) return []; colonized.add(arr[1]); return [{ ...t, text: `◆ First ship lands: ${arr[1]} colonized (${t.text.split(" ")[0]})`, level: "ok" }]; }
  return t.enemyId || /✓|★|⚠/.test(t.text) ? [t] : [];
});
const tlItems = (notable.length > 140 ? [...notable.slice(0, 40), null, ...notable.slice(-99)] : notable).map((t) => t === null ? `<li class="gap">… ${notable.length - 139} more …</li>` :
  `<li class="${t.level ?? (t.text.startsWith("✓") ? "ok" : "info")}"><time>${fmtTime(t.at)}</time><span>${esc(t.text)}</span></li>`).join("");

const planetCards = planets.map((p) => {
  const st = perPlanet.get(p.id) ?? P(p.id);
  const pe = ens.filter((e) => e.planetIds.includes(p.id));
  const tasks = [...st.tasks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const kn = live?.planets.find((x) => x.id === p.id)?.knowledge ?? p.knowledge;
  const tot = st.charted + st.frontier;
  return `<article class="planet" style="--c:${p.color}">
    <header><div class="orb"></div><div><h3>${esc(p.name)}</h3><div class="muted small">${esc(p.cycle.label)} · ${(p.progress * 100).toFixed(0)}% through · colonization ${p.colonization}/3</div></div></header>
    <div class="stats">
      <div><b>${st.units.size}</b><span>motherships</span></div><div><b>${st.subs.size}</b><span>subagents</span></div>
      <div><b>${st.tools}</b><span>tool calls</span></div><div><b>${st.memW}</b><span>GBrain writes</span></div>
      <div><b>${kn}</b><span>brain pages</span></div><div><b>${pe.filter((e) => e.resolvedAt).length}/${pe.length}</b><span>enemies cleared</span></div>
    </div>
    ${tot ? `<div class="small muted">Charted ${st.charted} · frontier ${st.frontier}</div>${bar(st.charted / tot, p.color)}` : ""}
    ${tasks.length ? `<h4>Work</h4><ul class="tasks">${tasks.map(([t, n]) => `<li><span>${esc(t)}</span><em>×${n}</em></li>`).join("")}</ul>` : `<p class="muted small">No work recorded yet.</p>`}
    ${pe.length ? `<h4>Blockers</h4><ul class="blk">${pe.slice(0, 5).map((e) => `<li><i style="background:${e.humanOnly ? GOLD : QC[e.quadrant]}"></i><span>${esc(e.title)}</span><em>${e.resolvedAt ? fmtDur(e.resolvedAt - e.createdAt) : "open"}</em></li>`).join("")}</ul>` : ""}
  </article>`;
}).join("");

const memByDept = planets.map((p) => ({ p, w: perPlanet.get(p.id)?.memW ?? 0 }));
const memMax = Math.max(1, ...memByDept.map((x) => x.w));
const kindCounts = Object.entries(ens.reduce<Record<string, number>>((a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
const generated = new Date();
const realN = events.length - simEvents;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>C&amp;C after-action report</title>
<meta name="description" content="What a company of Claude Code agents did, as seen from C&amp;C, an RTS command center for agent swarms.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#04070d;--panel:rgba(12,22,38,.72);--line:#1a2c44;--ink:#dbe8f7;--mut:#7f93ad;--cy:#4FD1FF;--gold:#FFD24A;--red:#FF4D4D;--ok:#5CF2B0}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "IBM Plex Sans",system-ui,sans-serif}
body{background:radial-gradient(1200px 700px at 70% -10%,#0e2a44 0,transparent 60%),radial-gradient(900px 600px at -10% 30%,#1a0f33 0,transparent 55%),var(--bg);min-height:100vh}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(79,209,255,.035) 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.wrap{max-width:1180px;margin:0 auto;padding:28px 16px 80px}
h1,h2,h3,h4{font-family:Rajdhani,sans-serif;letter-spacing:.06em;text-transform:uppercase;margin:0}
h1{font-size:clamp(34px,6vw,64px);line-height:1;font-weight:700;background:linear-gradient(90deg,#fff,#9fe6ff 40%,var(--cy));-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 40px rgba(79,209,255,.25)}
h2{font-size:22px;color:var(--cy);margin-bottom:14px;display:flex;align-items:center;gap:10px}h2:before{content:"";width:10px;height:10px;border:2px solid var(--cy);transform:rotate(45deg)}
h3{font-size:22px;color:var(--c)}h4{font-size:14px;color:var(--mut);margin:14px 0 6px}
.mono,time,.kv-v,.stats b,.axis,.lbl{font-family:"JetBrains Mono",monospace}
.muted{color:var(--mut)}.small{font-size:12.5px}code{font-family:"JetBrains Mono",monospace;font-size:.9em;color:#9fe6ff}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center;margin-bottom:26px}
.tag{display:inline-flex;gap:8px;align-items:center;font:600 12px "JetBrains Mono",monospace;color:var(--cy);border:1px solid var(--line);padding:4px 10px;border-radius:2px;margin-bottom:14px;text-transform:uppercase;letter-spacing:.1em}
.tag i{width:7px;height:7px;background:var(--ok);border-radius:50%;box-shadow:0 0 10px var(--ok)}
.lede{font-size:17px;color:#b9cbe0;max-width:56ch;margin:14px 0 0}
.panel{background:var(--panel);border:1px solid var(--line);padding:18px;position:relative;backdrop-filter:blur(6px);margin-bottom:22px;clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}
.map{width:100%;height:auto;display:block;filter:drop-shadow(0 0 30px rgba(79,209,255,.12))}
.lbl{font-size:44px;text-anchor:middle;letter-spacing:.1em}.lbl.big{font-size:62px;font-weight:600}.lbl.sm{font-size:34px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.kpi{background:var(--panel);border:1px solid var(--line);border-top:2px solid var(--c);padding:14px 16px}
.kv-l{font:600 12px Rajdhani,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.kv-v{font-size:30px;font-weight:600;color:var(--c);line-height:1.2;margin-top:4px}.kv-s{font-size:12.5px;color:var(--mut)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.bar{height:6px;background:#0f1a2a;border:1px solid var(--line);margin:6px 0 10px}.bar i{display:block;height:100%}
.rowbar{display:grid;grid-template-columns:120px 1fr 70px;gap:10px;align-items:center;font-size:13.5px;margin:6px 0}.rowbar .bar{margin:0}.rowbar b{font-family:"JetBrains Mono",monospace;text-align:right;font-weight:600}
.lanes{width:100%;height:auto}.lane-lbl{font:600 14px Rajdhani,sans-serif;letter-spacing:.08em;text-transform:uppercase}.axis{font-size:11px;fill:var(--mut)}
.feed{list-style:none;margin:0;padding:0;max-height:420px;overflow:auto;font-size:13.5px}
.feed li{display:grid;grid-template-columns:78px 1fr;gap:10px;padding:5px 8px;border-left:2px solid transparent}.feed li:nth-child(odd){background:rgba(255,255,255,.02)}
.feed time{color:var(--mut);font-size:12px}.feed .alert{border-color:var(--red)}.feed .warn{border-color:#FFB020}.feed .ok{border-color:var(--ok)}.feed .gap{display:block;text-align:center;color:var(--mut)}
.planets{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px}
.planet{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--c);padding:16px}
.planet header{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.orb{width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff 0,var(--c) 30%,#000 110%);box-shadow:0 0 18px var(--c)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.stats div{background:rgba(0,0,0,.25);padding:8px;border:1px solid var(--line)}
.stats b{display:block;font-size:20px;color:var(--c)}.stats span{font-size:11.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.tasks,.blk{list-style:none;margin:0;padding:0;font-size:13.5px}.tasks li,.blk li{display:flex;gap:8px;align-items:center;padding:3px 0;border-bottom:1px dashed #16243a}
.tasks span,.blk span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tasks em,.blk em{font:12px "JetBrains Mono",monospace;color:var(--mut);font-style:normal}
.blk i{width:9px;height:9px;transform:rotate(45deg);flex:none}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left}th{font:600 12px Rajdhani,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}td{font-family:"JetBrains Mono",monospace}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px;margin:0 0 10px}.kv dt{color:var(--mut)}.kv dd{margin:0;font-family:"JetBrains Mono",monospace;word-break:break-all}
.river-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:18px}.spark{width:100%;height:60px}
.gem{width:14px;height:14px;background:#40E0D0;transform:rotate(45deg);box-shadow:0 0 14px #40E0D0;display:inline-block}.river h2:before{display:none}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--mut);margin-top:10px}.legend i{display:inline-block;width:10px;height:10px;transform:rotate(45deg);margin-right:6px}
.rv{display:grid;grid-template-columns:1fr 1fr;gap:0}.rv>div{padding:12px 14px;border:1px solid var(--line)}.rv h4{margin-top:0}.rv ul{margin:0;padding-left:18px;font-size:14px}
.real h4{color:var(--ok)}.sim h4{color:#FFB020}
footer{color:var(--mut);font-size:12.5px;text-align:center;margin-top:30px}
@media (max-width:860px){.hero,.two,.planets,.river-grid,.rv{grid-template-columns:1fr}.kpis{grid-template-columns:1fr 1fr}.rowbar{grid-template-columns:90px 1fr 60px}}
</style></head><body><div class="wrap">
<section class="hero">
  <div>
    <div class="tag"><i></i>After-action report · ${esc(S.company)} · ${generated.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
    <h1>C&amp;C after&#8209;action report</h1>
    <p class="lede">One person ran a company of Claude Code agents from an RTS command center. Every ship below was a real agent session (or a labeled simulation); every enemy was something that blocked them. This is what happened between <span class="mono">${fmtTime(t0)}</span> and <span class="mono">${fmtTime(t1)}</span> PT.</p>
    <div class="legend"><span><i style="background:${GOLD}"></i>gold = human-only</span>${(Object.keys(QC) as Quadrant[]).map((q) => `<span><i style="background:${QC[q]}"></i>${QL[q]}</span>`).join("")}</div>
  </div>
  <div class="panel" style="padding:8px">${systemSvg()}<div class="small muted" style="text-align:center;padding:4px 0 2px">Snapshot at ${fmtTime(S.now)} · ${S.units.length} units on the map · ${S.enemies.filter((e) => !e.resolved).length} enemies open${live ? "" : " · (server offline: replayed state)"}</div></div>
</section>

<section class="kpis">
  ${kpi("Units deployed", String(motherships.size), `${realSessions.size} real · ${motherships.size - realSessions.size} simulated`)}
  ${kpi("Subagents", String(subagents.size), `fanned out by motherships`, "#7C9CFF")}
  ${kpi("Tool calls", toolCalls.toLocaleString(), `${toolFails} failed (${toolCalls ? ((toolFails / toolCalls) * 100).toFixed(1) : 0}%)`, "#5CF2B0")}
  ${kpi("Enemies cleared", `${cleared.length}<span class="muted" style="font-size:18px"> / ${ens.length}</span>`, `${open.length} still open · median ${fmtDur(ttr)} to clear`, "#FF7AD9")}
  ${kpi("Gold blockers", `${goldCleared.length}<span class="muted" style="font-size:18px"> / ${gold.length}</span>`, `resolved by the human · median ${fmtDur(goldTtr)}`, GOLD)}
  ${kpi("GBrain writes", String(memWrites), `${memReads} recalls/reads · sun pulses`, "#FFD166")}
  ${kpi("Charted vs frontier", `${charted}<span class="muted" style="font-size:18px"> / ${frontier}</span>`, `known routes vs first-time tasks`, "#9fe6ff")}
  ${kpi("Spend", usd(spend.reduce((a, m) => a + m.spent, 0)), liveCost ? `${usd(liveCost)} measured from live transcripts` : "across all mines", "#D97757")}
</section>

<section class="panel"><h2>Activity by planet</h2>${lanesSvg()}<div class="small muted">Area = tool calls over time. Bars under each lane = enemies, from appearance to clearance (gold = human-only).</div></section>

<div class="two">
  <section class="panel"><h2>Spend by mine</h2>
    ${spend.length ? spend.map((m) => `<div class="rowbar"><span>${esc(m.label.split(" (")[0])}</span>${bar(m.total ? m.spent / m.total : 0, m.color)}<b>${usd(m.spent)}</b></div><div class="small muted" style="margin:-4px 0 8px 130px">${usd(m.remaining)} of ${usd(m.total)} left · ${m.measured ? "measured" : "entered by hand"}${m.burnPerDay ? ` · ${usd(m.burnPerDay)}/day` : ""}</div>`).join("") : `<p class="muted">No mine data (server offline).</p>`}
  </section>
  <section class="panel"><h2>GBrain writes by department</h2>
    ${memByDept.map(({ p, w }) => `<div class="rowbar"><span>${esc(p.name)}</span>${bar(w / memMax, p.color)}<b>${w}</b></div>`).join("")}
    <h4>Enemy types</h4>${kindCounts.length ? kindCounts.map(([k, n]) => `<div class="rowbar"><span>${esc(k.replace("_", " "))}</span>${bar(n / Math.max(...kindCounts.map((x) => x[1])), "#FF7AD9")}<b>${n}</b></div>`).join("") : `<p class="muted small">None.</p>`}
  </section>
</div>

<h2 style="margin:8px 0 14px">Planets</h2>
<section class="planets">${planetCards}</section>

${riverSection()}

<div class="two">
  <section class="panel"><h2>Timeline</h2><ul class="feed">${tlItems || `<li class="muted">No events recorded.</li>`}</ul></section>
  <section class="panel"><h2>What's real vs simulated</h2>
    <p class="small muted" style="margin-top:0">This report: <b class="mono">${realN.toLocaleString()}</b> real hook events and <b class="mono">${simEvents.toLocaleString()}</b> simulated (${(simShare * 100).toFixed(0)}%). Simulated units carry a SIMULATED badge in the app.</p>
    <div class="rv">
      <div class="real"><h4>Real</h4><ul>
        <li>Claude Code agents, via HTTP hooks</li><li>Spawning + prompting via Superset</li><li>GBrain memory reads/writes (the sun)</li>
        <li>Token spend + context from transcripts</li><li>AI summaries + commander (headless Claude)</li><li>River-trained Sentinel, base vs trained eval</li><li>Memorable recall → charted routes</li></ul></div>
      <div class="sim"><h4>Simulated</h4><ul>
        <li>The scale shot (hundreds of units)</li><li>The galaxy of companies</li><li>Mines we can't meter (entered by hand)</li><li>Factory ticks while the scheduler is paused</li></ul></div>
    </div>
  </section>
</div>

<footer>Generated ${generated.toISOString()} by <code>app/scripts/report.ts</code> from <code>/api/state</code> + <code>data/events.jsonl</code> (${events.length.toLocaleString()} events replayed through the C&amp;C world reducer).<br>C&amp;C is a name-only nod to Command &amp; Conquer. Art: Kenney + Screaming Brain Studios (CC0).</footer>
</div></body></html>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`✓ Wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB) · ${events.length} events · ${motherships.size} units · ${ens.length} enemies · live state: ${live ? "yes" : "no (replayed)"}`);

// ---------------- publish (Superset Page) ----------------
if (args.includes("--publish")) {
  // Re-publishing versions the same page (same link): the page id is remembered in report/page.json.
  const PAGE = resolve(dirname(OUT), "page.json");
  const pageId = opt("page") ?? readJson(PAGE)?.id;
  const label = opt("label") ?? `Report ${fmtTime(realNow())} PT`;
  const cmd = ["superset", "pages", "publish", OUT, "--title", TITLE, "--visibility", "everyone", "--label", label, "--json", ...(pageId ? ["--page", pageId] : [])];
  const printable = `cd ~ && superset pages publish ${OUT} --title "${TITLE}" --visibility everyone --json${pageId ? ` --page ${pageId}` : ""}`;
  // Run outside the repo, and drop SUPERSET_API_KEY if it was auto-loaded from the repo .env (a placeholder there breaks the CLI).
  const env = { ...process.env } as Record<string, string>;
  try { const line = readFileSync(resolve(cfg.repoRoot, ".env"), "utf8").split("\n").find((l) => l.startsWith("SUPERSET_API_KEY=")); if (line && env.SUPERSET_API_KEY && line.includes(env.SUPERSET_API_KEY)) delete env.SUPERSET_API_KEY; } catch {}
  try {
    const p = Bun.spawnSync(cmd, { cwd: homedir(), env, stdout: "pipe", stderr: "pipe" });
    const out = p.stdout.toString(), err = p.stderr.toString();
    let url: string | undefined;
    let id: string | undefined;
    try { const j = JSON.parse(out); url = j.url ?? j.pageUrl ?? j.link ?? j.page?.url ?? j.data?.url; id = j.id ?? j.pageId ?? j.page?.id ?? j.data?.id; } catch {}
    url ??= (out.match(/https?:\/\/\S+/) ?? [])[0];
    if (p.exitCode === 0 && id) try { writeFileSync(PAGE, JSON.stringify({ id, url }, null, 2)); } catch {}
    if (p.exitCode === 0 && url) console.log(`✓ Published: ${url}`);
    else if (p.exitCode === 0) console.log(`✓ Published. CLI output:\n${out.trim()}`);
    else { console.log(`✗ Superset publish failed (exit ${p.exitCode}). ${(err || out).trim().split("\n").slice(-3).join(" | ")}\n  Run later:\n  ${printable}`); process.exitCode = 1; }
  } catch (e: any) {
    console.log(`✗ Superset CLI not available (${e?.message ?? e}). Run later:\n  ${printable}`); process.exitCode = 1;
  }
}
process.exit(process.exitCode ?? 0);
