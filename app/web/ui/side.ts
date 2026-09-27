// Right side panel for store.focus (SPEC §6, §7, §8.1).
import type { Store, Target } from "../store";
import type { DeptId, Enemy, EnemyKind, Factory, Mine, Planet, Quadrant, RankEntry, Tier, Unit, WorldState } from "../../shared/types";
import { el, esc, live, delegate, kfmt, usd, dur, ago, bar, sparkline, scoreColor, TIER_COLOR, QUAD_COLOR, QUAD_LABEL, KIND_LABEL, GOLD, STATUS_COLOR, MODE_LABEL } from "./util";
import { tierGlyph, kindGlyph } from "./glyphs";

const KINDS: EnemyKind[] = ["credential", "account", "approval", "rate_limit", "billing", "missing_info", "dependency", "failure"];
const QUADS: Quadrant[] = ["do_now", "schedule", "delegate", "drop"];
const DEPTS: DeptId[] = ["engineering", "marketing", "product_design", "arts"];
const TIERS: Tier[] = ["haiku", "sonnet", "opus", "fable", "river"];

export function createSide(root: HTMLElement, store: Store) {
  const panel = el("aside", "side glass");
  panel.setAttribute("aria-label", "Details");
  panel.innerHTML = `<button class="btn ghost x side-close" aria-label="Close panel" data-act="close">✕</button><div class="side-live"></div><div class="side-forms"></div>`;
  root.appendChild(panel);
  const body = live(panel.querySelector(".side-live")!);
  const forms = panel.querySelector<HTMLElement>(".side-forms")!;
  const checked = new Set<string>();
  let formsFor = "";

  const key = (t: Target | null) => (t ? `${t.kind}:${t.id}` : "");

  function render() {
    const s = store.state; const f = store.focus;
    if (!s || !f) { panel.hidden = true; formsFor = ""; return; }
    let html = "";
    if (f.kind === "enemy") { const e = store.enemy(f.id); html = e && !hiddenEnemy(e) ? enemyHtml(s, e) : gone("Enemy"); }
    else if (f.kind === "unit") { const u = store.unit(f.id); html = u && !hiddenUnit(u) ? unitHtml(s, u) : gone("Unit"); }
    else if (f.kind === "planet") { const p = s.planets.find((x) => x.id === f.id); html = p && !store.isHidden("planet", p.id) ? planetHtml(s, p) : gone("Planet"); }
    else if (f.kind === "factory") { const x = s.factories.find((q) => q.id === f.id); html = x && !store.isHidden("factory", x.id, { planetId: x.planetId }) ? factoryHtml(s, x) : gone("Factory"); }
    else if (f.kind === "mine") { const m = s.mines.find((q) => q.id === f.id); html = m && !store.isHidden("mine", m.id) ? mineHtml(s, m) : gone("Mine"); }
    else if (f.kind === "research") html = researchHtml(s);
    else if (f.kind === "sun") html = sunHtml(s);
    panel.hidden = false;
    body.set(html);
    if (formsFor !== key(f)) { formsFor = key(f); forms.innerHTML = formsHtml(s, f); }
  }

  const hiddenUnit = (u: Unit) => store.isHidden("unit", u.id, { planetId: u.planetId, projectId: u.projectId });
  const hiddenEnemy = (e: Enemy) => store.isHidden("enemy", e.id) || (e.planetIds.length > 0 && e.planetIds.every((p) => store.isHidden("planet", p)));
  const gone = (what: string) => `<div class="pad dim">${what} is gone or hidden.</div>`;

  // ── Enemy ──
  function enemyHtml(s: WorldState, e: Enemy) {
    const col = e.humanOnly ? GOLD : QUAD_COLOR[e.quadrant];
    const c = e.classification;
    const src = c ? (c.source === "sentinel" ? "RIVER Sentinel" : c.source === "sentinel-base" ? "RIVER base" : c.source === "fast" ? "Fast classifier" : c.source === "haiku" ? "Haiku" : "Rules") : "";
    const blocked = e.blocked.map((id) => store.unit(id)).filter((u): u is Unit => !!u && !hiddenUnit(u));
    const ranks = rankFor(s, e);
    const conf = (label: string, v: string, p: number) => `<div class="cf"><span class="lbl">${label}</span><span class="cf-v">${esc(v)}</span>${bar(p, p > 0.8 ? "#5CF2B0" : p > 0.55 ? "#FFB020" : "#FF4D4D")}<span class="num dim">${Math.round(p * 100)}%</span></div>`;
    return `<header class="s-head" style="--c:${col}">
        <div class="s-icon">${kindGlyph(e.kind, col, 34)}</div>
        <div class="s-titles"><h2>${esc(e.title)}</h2>
          <div class="s-badges"><span class="badge" style="--c:${col}">${esc(KIND_LABEL[e.kind])}</span><span class="badge" style="--c:${QUAD_COLOR[e.quadrant]}">${esc(QUAD_LABEL[e.quadrant])}</span>${e.humanOnly ? `<span class="badge gold">! Human only</span>` : ""}${e.pendingPermission ? `<span class="badge warn">permission</span>` : ""}${e.simulated ? `<span class="badge sim">sim</span>` : ""}</div>
        </div></header>
      <p class="s-reason">${esc(e.reason)}</p>
      <div class="s-kv num"><span>strength <b>${e.strength.toFixed(1)}</b></span><span>blocked <b>${e.blocked.length}</b></span><span>attackers <b>${e.attackers.length}</b></span><span>age <b>${dur(s.now - e.createdAt)}</b></span></div>
      ${c ? `<section><h3>Classification <span class="badge src" style="--c:${c.source.startsWith("sentinel") ? "#40E0D0" : "#8A96A8"}">${esc(src)}${c.latencyMs != null ? ` <span class="num">${Math.round(c.latencyMs)}ms</span>` : ""}</span></h3>
        ${conf("Kind", KIND_LABEL[c.kind.label] ?? c.kind.label, c.kind.p)}${conf("Quadrant", QUAD_LABEL[c.quadrant.label] ?? c.quadrant.label, c.quadrant.p)}${conf("Human", c.humanOnly.label ? "yes" : "no", c.humanOnly.p)}${conf("Dept", deptName(s, c.department.label), c.department.p)}${conf("Tier", c.tier.label, c.tier.p)}</section>` : ""}
      ${e.dependsOnUnit && store.unit(e.dependsOnUnit) ? `<button class="blocked-by dep" data-act="focus-unit" data-id="${esc(e.dependsOnUnit)}"><span class="lbl">Waiting on</span> ${esc(store.unit(e.dependsOnUnit)!.label)}</button>` : ""}
      ${blocked.length ? `<section><h3>Blocked units <span class="num dim">${blocked.length}</span></h3><ul class="ulist">${blocked.map((u) => unitRow(u)).join("")}</ul></section>` : ""}
      ${e.humanOnly ? `<section class="gold-sec"><h3>Human only</h3><p class="dim small">Agents can't do this step (phone, CAPTCHA, payment, legal, secrets). Put secrets in <span class="mono">.env</span>; C&amp;C only tells units "unblocked".</p></section>`
        : `<section><h3>Suitability <span class="dim small">${ranks.local ? "local estimate" : "ranked by Sentinel + Haiku"}</span></h3>
        <ul class="rank">${ranks.entries.map((r) => { const u = store.unit(r.unitId)!; return `<li style="--c:${scoreColor(r.score)}">
          <label class="rk-check"><input type="checkbox" data-act="rk-check" data-id="${esc(u.id)}" ${checked.has(u.id) ? "checked" : ""} aria-label="Select ${esc(u.label)}"></label>
          <span class="rk-score num">${Math.round(r.score)}</span>
          <div class="rk-main"><div class="rk-name">${tierGlyph(u.tier, 14)}<b data-act="focus-unit" data-id="${esc(u.id)}">${esc(u.label)}</b><span class="status" style="--c:${STATUS_COLOR[u.status]}"><i></i>${esc(u.status)}</span></div><div class="rk-reason">${esc(r.reason)}</div></div>
          <button class="btn sm" data-act="send" data-id="${esc(u.id)}" title="Shift-click to interrupt">Send</button></li>`; }).join("") || `<li class="dim pad">No free units ranked yet.</li>`}
        </ul>
        <div class="rk-foot"><button class="btn primary" data-act="send-sel" ${checked.size ? "" : "disabled"}>Send selected (${[...checked].filter((id) => store.unit(id)).length})</button></div>
        <div class="deploy">${(["haiku", "sonnet", "opus", "fable"] as Tier[]).map((t) => `<button class="btn ghost deploy-btn" data-act="deploy" data-tier="${t}" style="--c:${TIER_COLOR[t]}">${tierGlyph(t, 14)} + Deploy new ${t[0]!.toUpperCase() + t.slice(1)}</button>`).join("")}</div>
      </section>`}`;
  }

  function rankFor(s: WorldState, e: Enemy): { entries: RankEntry[]; local: boolean } {
    const got = store.ranks.get(e.id);
    const ok = (id: string) => { const u = store.unit(id); return !!u && !hiddenUnit(u) && u.status !== "dead"; };
    if (got && got.length) return { entries: [...got].filter((r) => ok(r.unitId)).sort((a, b) => b.score - a.score), local: false };
    // Local heuristic until the server ranks (fixture / S3 not merged).
    const want = e.classification?.tier.label; const dept = e.classification?.department.label ?? e.planetIds[0];
    const entries = s.units.filter((u) => ok(u.id) && !e.blocked.includes(u.id) && u.role !== "sentinel").map((u) => {
      let sc = 40; const why: string[] = [];
      if (u.status === "idle" || u.status === "done") { sc += 25; why.push("free"); } else if (u.status === "blocked") { sc -= 25; why.push("blocked itself"); } else { sc -= 5; why.push("busy (queues)"); }
      if (dept && u.planetId === dept) { sc += 18; why.push("same dept"); }
      if (want && u.tier === want) { sc += 15; why.push(`${want} fits`); }
      if (u.veteran) { sc += 6; why.push("veteran"); }
      if (u.contextWindow && u.contextUsed / u.contextWindow > 0.8) { sc -= 12; why.push("context nearly full"); }
      return { unitId: u.id, score: Math.max(0, Math.min(100, sc)), reason: why.join(" · ") };
    }).sort((a, b) => b.score - a.score).slice(0, 12);
    return { entries, local: true };
  }

  // ── Unit ──
  function unitHtml(s: WorldState, u: Unit) {
    const proj = s.projects.find((p) => p.id === u.projectId);
    const parent = u.parentId ? store.unit(u.parentId) : undefined;
    const mismatch = parent && parent.permissionMode !== u.permissionMode;
    const tok = u.tokens;
    const enemy = u.blockedBy ? store.enemy(u.blockedBy) : undefined;
    return `<header class="s-head" style="--c:${TIER_COLOR[u.tier]}"><div class="s-icon">${tierGlyph(u.tier, 34)}</div>
      <div class="s-titles"><h2>${esc(u.label)}</h2><div class="s-badges"><span class="badge" style="--c:${TIER_COLOR[u.tier]}">${esc(u.tier)}</span><span class="status" style="--c:${STATUS_COLOR[u.status]}"><i></i>${esc(u.status)}</span>${proj ? `<span class="chip"><i class="dot" style="background:${proj.color}"></i>${esc(proj.name)}</span>` : ""}</div></div></header>
      ${u.summary ? `<p class="s-reason">${esc(u.summary)}</p>` : `<p class="s-reason shimmer">summarizing…</p>`}
      ${enemy ? `<button class="blocked-by" data-act="focus-enemy" data-id="${esc(enemy.id)}"><span class="lbl">Blocked by</span> ${esc(enemy.title)}</button>` : ""}
      <section><h3>Stats</h3><dl class="stats num">
        <dt>Tokens</dt><dd>${kfmt(tok.input)} in · ${kfmt(tok.output)} out</dd>
        <dt>Cache</dt><dd>${kfmt(tok.cacheRead)} read · ${kfmt(tok.cacheWrite)} write</dd>
        <dt>Cost</dt><dd>${usd(u.costUsd)}</dd>
        <dt>Tools</dt><dd>${u.toolCount}${u.lastTool ? ` · last <span class="mono">${esc(u.lastTool)}</span>` : ""}</dd>
        <dt>Failures</dt><dd class="${u.failCount ? "bad" : ""}">${u.failCount}</dd>
        <dt>ETA</dt><dd>${u.charted && u.etaMs != null ? dur(Math.max(0, u.startedAt + u.etaMs - s.now)) + " left" : `<span class="warn-t">? frontier</span>`}</dd>
        <dt>Route</dt><dd>${u.charted ? "charted" : "frontier"}${u.veteran ? ` · <span class="badge" style="--c:#B8F34A">veteran</span>` : ""}</dd>
        <dt>Progress</dt><dd>${bar(u.progress, "#4FD1FF")}</dd>
        <dt>Mode</dt><dd>${esc(MODE_LABEL[u.permissionMode])}${mismatch ? ` <span class="warn-t" title="Mothership runs ${esc(parent!.permissionMode)}">⚠ differs from parent (${esc(MODE_LABEL[parent!.permissionMode])})</span>` : ""}</dd>
        <dt>Role</dt><dd>${esc(u.role)}${u.agentType ? " · " + esc(u.agentType) : ""}${parent ? ` · parent <a data-act="focus-unit" data-id="${esc(parent.id)}">${esc(parent.label)}</a>` : ""}</dd>
        <dt>Started</dt><dd>${ago(u.startedAt, s.now)}</dd>
        <dt>Groups</dt><dd>${u.groups.length ? u.groups.map((g) => `<span class="grp-n">${g}</span>`).join("") : `<span class="dim">none</span>`}</dd>
      </dl></section>`;
  }

  // ── Planet ──
  function planetHtml(s: WorldState, p: Planet) {
    const left = p.cycle.endAt - s.now;
    const units = s.units.filter((u) => u.planetId === p.id && !hiddenUnit(u));
    const enemies = s.enemies.filter((e) => e.planetIds.includes(p.id) && !hiddenEnemy(e));
    const facs = s.factories.filter((f) => f.planetId === p.id);
    const stage = ["Barren", "Outpost", "Colony", "Developed"][p.colonization];
    return `<header class="s-head" style="--c:${p.color}"><div class="s-icon"><span class="planet-orb" style="--c:${p.color}"></span></div>
      <div class="s-titles"><h2>${esc(p.name)}</h2><div class="s-badges"><span class="badge" style="--c:${p.color}">${esc(stage)}</span><span class="badge">${p.cycle.kind}</span></div></div></header>
      <section><h3>${esc(p.cycle.label)}</h3>${bar(p.progress, p.color, "bar thick")}<div class="s-kv num"><span><b>${Math.round(p.progress * 100)}%</b> through</span><span><b>${left > 0 ? dur(left) : "ended"}</b> left</span><span>${(left / 864e5).toFixed(1)} days</span></div></section>
      <section><h3>Colonization</h3><div class="stages">${[0, 1, 2, 3].map((i) => `<i class="${i <= p.colonization ? "on" : ""}" style="--c:${p.color}"></i>`).join("")}</div></section>
      <dl class="stats num"><dt>Knowledge</dt><dd>${p.knowledge} pages</dd><dt>Memory traffic</dt><dd>${bar(p.memTraffic, "#FFD166")}</dd><dt>Units</dt><dd>${units.length} (${units.filter((u) => u.status === "working" || u.status === "acting").length} active)</dd><dt>Enemies</dt><dd class="${enemies.length ? "bad" : ""}">${enemies.length}</dd><dt>Factories</dt><dd>${facs.length}</dd></dl>
      <div class="s-actions"><button class="btn primary" data-act="enter-planet" data-id="${p.id}">Enter planet</button></div>`;
  }

  function factoryHtml(s: WorldState, f: Factory) {
    return `<header class="s-head" style="--c:#B8F34A"><div class="s-icon">⚙</div><div class="s-titles"><h2>${esc(f.label)}</h2><div class="s-badges"><span class="badge" style="--c:${f.paused ? "#8A96A8" : "#B8F34A"}">${f.paused ? "paused" : "running"}</span><span class="chip dim">${esc(deptName(s, f.planetId))}</span></div></div></header>
      <p class="s-reason mono small">${esc(f.prompt)}</p>
      <dl class="stats num"><dt>Cadence</dt><dd>every ${dur(f.cadenceMs)}</dd><dt>Next run</dt><dd>${f.paused ? "—" : dur(f.nextRunAt - s.now)}</dd><dt>Runs</dt><dd>${f.runs}</dd><dt>Outputs/day</dt><dd>${f.outputsPerDay.toFixed(1)}</dd><dt>Credits/day</dt><dd>${usd(f.creditsPerDay)}</dd>${f.lastOutput ? `<dt>Last output</dt><dd class="trunc">${esc(f.lastOutput)}</dd>` : ""}</dl>
      <div class="s-actions"><button class="btn primary" data-act="factory-run" data-id="${esc(f.id)}">Run now</button><button class="btn" data-act="factory-toggle" data-id="${esc(f.id)}" data-paused="${f.paused ? "0" : "1"}">${f.paused ? "Resume" : "Pause"}</button></div>`;
  }

  function mineHtml(s: WorldState, m: Mine) {
    const days = m.burnPerDay > 0 ? m.remaining / m.burnPerDay : Infinity;
    return `<header class="s-head" style="--c:${m.color}"><div class="s-icon"><span class="planet-orb rock" style="--c:${m.color}"></span></div><div class="s-titles"><h2>${esc(m.label)}</h2><div class="s-badges"><span class="badge" style="--c:${m.measured ? "#5CF2B0" : "#8A96A8"}">${m.measured ? "measured" : "manual"}</span></div></div></header>
      <section><h3>Remaining</h3><div class="big num">${usd(m.remaining)} <span class="dim">/ ${usd(m.total)}</span></div>${bar(m.total ? m.remaining / m.total : 0, m.color, "bar thick")}</section>
      <dl class="stats num"><dt>Burn/day</dt><dd>${usd(m.burnPerDay)}</dd><dt>Runway</dt><dd class="${days < 1 ? "bad" : ""}">${Number.isFinite(days) ? days.toFixed(1) + " days" : "∞"}</dd><dt>Spent</dt><dd>${usd(m.total - m.remaining)}</dd></dl>`;
    void s;
  }

  function researchHtml(s: WorldState) {
    const r = s.research; const card = r.card ?? {};
    const cardRows = Object.entries(card).filter(([, v]) => typeof v === "number" || typeof v === "string" || typeof v === "boolean").slice(0, 8);
    return `<header class="s-head" style="--c:#40E0D0"><div class="s-icon">${tierGlyph("river", 34)}</div><div class="s-titles"><h2>Research Center</h2><div class="s-badges"><span class="badge" style="--c:${r.sidecarUp ? "#5CF2B0" : "#FF4D4D"}">sidecar ${r.sidecarUp ? "up" : "down"}</span><span class="badge" style="--c:#40E0D0">RIVER</span></div></div></header>
      <section><h3>Sentinel engine</h3><select data-act="engine" aria-label="Sentinel engine">${(["sentinel", "sentinel-base", "fast", "haiku"] as const).map((e) => `<option value="${e}" ${r.engine === e ? "selected" : ""}>${e}</option>`).join("")}</select></section>
      <section><h3>Models <span class="num dim">${r.models.length}</span></h3><ul class="models">${r.models.map((m) => `<li><div><b class="mono">${esc(m.id)}</b> ${m.active ? `<span class="badge" style="--c:#5CF2B0">active</span>` : ""}<div class="dim small mono trunc">${esc(m.checkpoint)}</div>${m.eval ? `<div class="small">${Object.entries(m.eval).slice(0, 4).map(([k, v]) => `<span class="kv">${esc(k)} <b class="num">${esc(fmtV(v))}</b></span>`).join("")}</div>` : ""}</div>${m.active ? "" : `<button class="btn sm" data-act="promote" data-id="${esc(m.id)}">Promote</button>`}</li>`).join("") || `<li class="dim">No models yet.</li>`}</ul></section>
      ${cardRows.length ? `<section><h3>Eval card</h3><dl class="stats num">${cardRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(fmtV(v))}</dd>`).join("")}</dl></section>` : ""}
      <section><h3>Training runs <span class="num dim">${r.runs.length}</span></h3><ul class="runs">${r.runs.slice(-5).reverse().map((t) => { const last = t.steps[t.steps.length - 1]; return `<li><div><b class="mono">${esc(t.id)}</b> <span class="badge" style="--c:${t.status === "done" ? "#5CF2B0" : t.status === "failed" ? "#FF4D4D" : "#FFB020"}">${t.status}</span><div class="dim small num">${last ? `step ${last.step} · loss ${last.loss.toFixed(3)}` : "no steps"}${t.costUsd != null ? ` · ${usd(t.costUsd)}` : ""}</div>${t.message ? `<div class="dim small trunc">${esc(t.message)}</div>` : ""}</div>${sparkline(t.steps.map((x) => x.loss), 110, 30, "#40E0D0")}</li>`; }).join("") || `<li class="dim">No runs yet.</li>`}</ul></section>
      <section class="retrain"><div><b class="big num">${r.corrections}</b> <span class="dim">new corrections</span></div><button class="btn primary" data-act="retrain">Retrain</button></section>`;
  }

  function sunHtml(s: WorldState) {
    const k = s.knowledge;
    return `<header class="s-head" style="--c:#FFD166"><div class="s-icon"><span class="planet-orb" style="--c:#FFD166"></span></div><div class="s-titles"><h2>The Sun · Memory</h2><div class="s-badges"><span class="badge" style="--c:#FFD166">GBrain</span><span class="badge" style="--c:#5CF2B0">Memorable</span></div></div></header>
      <dl class="stats num"><dt>Pages</dt><dd>${k.pages}</dd><dt>Facts</dt><dd>${k.facts}</dd><dt>Procedures</dt><dd>${k.procedures}</dd><dt>Activity</dt><dd>${bar(s.sunPulse, "#FFD166")}</dd></dl>
      <section><h3>Recent</h3><ul class="ulist">${k.recent.slice(-8).reverse().map((m) => `<li><span class="badge" style="--c:${m.kind === "write" ? "#FFD166" : "#4FD1FF"}">${m.kind}</span> <span class="mono">${esc(m.op)}</span> <span class="dim trunc">${esc(m.slug ?? m.planetId ?? "")}</span> <span class="dim num">${ago(m.at, s.now)}</span></li>`).join("") || `<li class="dim">quiet</li>`}</ul></section>
      <div class="s-actions"><button class="btn primary" data-act="enter-memory">Enter memory</button></div>`;
  }

  // ── Static forms (rendered once per focus target so typing survives ticks) ──
  function formsHtml(s: WorldState, f: Target) {
    if (f.kind === "enemy") {
      const e = store.enemy(f.id); if (!e) return "";
      const c = e.classification;
      const opt = <T extends string>(vals: T[], cur: T | undefined, lab?: (v: T) => string) => vals.map((v) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(lab ? lab(v) : v)}</option>`).join("");
      return `${e.humanOnly ? `<section class="gold-sec"><h3>Resolve (human)</h3><label class="chk"><input type="checkbox" class="res-done"> I did the human step</label><input class="res-note" placeholder="Note to units (no secrets): e.g. token added to .env"><button class="btn gold" data-act="resolve" data-id="${esc(e.id)}">Resolve</button></section>` : ""}
        <details class="correct"><summary>Correct classification</summary><div class="cgrid">
          <label>Kind<select name="kind">${opt(KINDS, c?.kind.label ?? e.kind, (v) => KIND_LABEL[v])}</select></label>
          <label>Quadrant<select name="quadrant">${opt(QUADS, c?.quadrant.label ?? e.quadrant, (v) => QUAD_LABEL[v])}</select></label>
          <label>Human only<select name="humanOnly">${opt(["yes", "no"], (c?.humanOnly.label ?? e.humanOnly) ? "yes" : "no")}</select></label>
          <label>Department<select name="department">${opt(DEPTS, c?.department.label ?? e.planetIds[0], (v) => deptName(s, v))}</select></label>
          <label>Tier<select name="tier">${opt(TIERS, (c?.tier.label as Tier) ?? "sonnet")}</select></label>
        </div><button class="btn" data-act="correct" data-id="${esc(e.id)}">Submit correction → River dataset</button></details>`;
    }
    if (f.kind === "unit") return `<section><h3>Actions</h3><div class="s-actions"><button class="btn primary" data-act="prompt-unit">Prompt</button><label class="grp-add">Add to group <select class="grp-sel">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option>${n}</option>`).join("")}</select></label><button class="btn" data-act="add-group" data-id="${esc(f.id)}">Add</button></div></section>`;
    if (f.kind === "planet") return `<details class="correct"><summary>Build factory</summary><div class="fgrid">
        <input class="bf-label" placeholder="Label, e.g. Weekly changelog"><textarea class="bf-prompt" rows="3" placeholder="What each run asks an agent to do"></textarea>
        <label>Cadence <select class="bf-cad"><option value="3600000">hourly</option><option value="21600000">every 6h</option><option value="86400000" selected>daily</option><option value="604800000">weekly</option></select></label>
      </div><button class="btn primary" data-act="build-factory" data-id="${esc(f.id)}">Build factory</button></details>`;
    return "";
  }

  delegate(panel, {
    close: () => store.setFocus(null),
    "focus-unit": (t) => store.select([t.dataset.id!]),
    "focus-enemy": (t) => store.setFocus({ kind: "enemy", id: t.dataset.id! }),
    "rk-check": (t) => { const id = t.dataset.id!; (t as HTMLInputElement).checked ? checked.add(id) : checked.delete(id); body.reset(); render(); },
    send: (t, e) => { const f = store.focus; if (f?.kind !== "enemy") return; store.command({ type: "attack", enemyId: f.id, unitIds: [t.dataset.id!], interrupt: (e as MouseEvent).shiftKey || undefined }); },
    "send-sel": (_t, e) => { const f = store.focus; const ids = [...checked].filter((id) => store.unit(id)); if (f?.kind !== "enemy" || !ids.length) return; store.command({ type: "attack", enemyId: f.id, unitIds: ids, interrupt: (e as MouseEvent).shiftKey || undefined }); checked.clear(); body.reset(); render(); },
    deploy: (t) => { const f = store.focus; if (f?.kind === "enemy") store.command({ type: "deploy_for_enemy", enemyId: f.id, tier: t.dataset.tier as Tier }); },
    resolve: (t) => {
      const note = forms.querySelector<HTMLInputElement>(".res-note")?.value.trim(); const done = forms.querySelector<HTMLInputElement>(".res-done")?.checked;
      if (!done) { store.toast("Tick the checkbox once the human step is done", "warn"); return; }
      store.command({ type: "resolve", enemyId: t.dataset.id!, note: note || undefined });
    },
    correct: (t) => {
      const v = (n: string) => forms.querySelector<HTMLSelectElement>(`select[name=${n}]`)?.value;
      store.command({ type: "correct", enemyId: t.dataset.id!, fields: { kind: v("kind") as EnemyKind, quadrant: v("quadrant") as Quadrant, humanOnly: v("humanOnly") === "yes", department: v("department") as DeptId, tier: v("tier") as Tier } });
    },
    "prompt-unit": () => { document.querySelector<HTMLTextAreaElement>(".c-input textarea")?.focus(); },
    "add-group": (t) => {
      const g = Number(forms.querySelector<HTMLSelectElement>(".grp-sel")?.value ?? 1);
      const members = (store.state?.units ?? []).filter((u) => u.groups.includes(g)).map((u) => u.id);
      store.command({ type: "group", group: g, unitIds: [...new Set([...members, t.dataset.id!])] });
    },
    "enter-planet": (t) => store.setMode({ kind: "planet", planetId: t.dataset.id as DeptId }),
    "enter-memory": () => store.setMode({ kind: "memory" }),
    "factory-run": (t) => store.command({ type: "factory_run", factoryId: t.dataset.id! }),
    "factory-toggle": (t) => store.command({ type: "factory_toggle", factoryId: t.dataset.id!, paused: t.dataset.paused === "1" }),
    "build-factory": (t) => {
      const label = forms.querySelector<HTMLInputElement>(".bf-label")?.value.trim(); const prompt = forms.querySelector<HTMLTextAreaElement>(".bf-prompt")?.value.trim();
      const cad = Number(forms.querySelector<HTMLSelectElement>(".bf-cad")?.value ?? 86400000);
      if (!label || !prompt) { store.toast("Factory needs a label and a prompt", "warn"); return; }
      store.command({ type: "build_factory", planetId: t.dataset.id as DeptId, label, prompt, cadenceMs: cad });
    },
    promote: (t) => store.command({ type: "research_promote", modelId: t.dataset.id! }),
    retrain: () => store.command({ type: "research_retrain" }),
  });
  panel.addEventListener("change", (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.dataset.act === "engine") { store.command({ type: "research_engine", engine: t.value as WorldState["research"]["engine"] }); t.blur(); }
  });

  function unitRow(u: Unit) {
    return `<li data-act="focus-unit" data-id="${esc(u.id)}" tabindex="0">${tierGlyph(u.tier, 14)}<b>${esc(u.label)}</b><span class="dim trunc">${esc(u.summary ?? u.task ?? "")}</span><span class="num dim">${ago(u.lastEventAt)}</span></li>`;
  }

  store.on("state", render);
  store.on("focus", () => { checked.clear(); body.reset(); render(); });
  store.on("rank", (r) => { if (store.focus?.kind === "enemy" && store.focus.id === r.enemyId) { body.reset(); render(); } });
  panel.hidden = true;
}

function deptName(s: WorldState, id: string) { return s.planets.find((p) => p.id === id)?.name ?? id; }
function fmtV(v: unknown) { return typeof v === "number" ? (Math.abs(v) < 1 && v !== 0 ? v.toFixed(3) : String(Math.round(v * 100) / 100)) : String(v); }
