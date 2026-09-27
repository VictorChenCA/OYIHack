// Hover tooltip, top bar, toasts.
import type { Store, Target } from "../store";
import type { WorldState } from "../../shared/types";
import { el, esc, live, delegate, kfmt, usd, dur, bar, TIER_COLOR, QUAD_COLOR, QUAD_LABEL, KIND_LABEL, GOLD, STATUS_COLOR } from "./util";
import { tierGlyph, kindGlyph } from "./glyphs";

export function createTooltip(root: HTMLElement, store: Store) {
  const tip = el("div", "tip glass"); tip.setAttribute("role", "tooltip"); tip.hidden = true; root.appendChild(tip);
  tip.style.pointerEvents = "none";
  let cur: { target: Target | null; x: number; y: number } = { target: null, x: 0, y: 0 };
  function render() {
    const s = store.state; const t = cur.target;
    const html = s && t ? content(s, t) : "";
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = cur.x + 16, y = cur.y + 16;
    if (x + w > innerWidth - 8) x = cur.x - w - 12; if (y + h > innerHeight - 8) y = cur.y - h - 12;
    tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }
  const LAYER_OF: Partial<Record<Target["kind"], Parameters<Store["layerOn"]>[0]>> = { unit: "units", enemy: "enemies", factory: "factories", mine: "mines", research: "research" };
  function content(s: WorldState, t: Target): string {
    const layer = LAYER_OF[t.kind]; if (layer && !store.layerOn(layer)) return "";
    if (t.kind === "unit") {
      const u = store.unit(t.id); if (!u || store.isHidden("unit", u.id, { planetId: u.planetId, projectId: u.projectId })) return "";
      const ctx = u.contextWindow ? Math.round((u.contextUsed / u.contextWindow) * 100) : 0;
      return `<div class="tt-h">${tierGlyph(u.tier, 16)}<b>${esc(u.label)}</b><span class="status" style="--c:${STATUS_COLOR[u.status]}"><i></i>${esc(u.status)}</span></div>
        <div class="tt-l">${esc(u.summary ?? u.task ?? "no task")}</div>
        <div class="tt-f num"><span style="color:${TIER_COLOR[u.tier]}">${esc(u.tier)}</span><span>ctx ${ctx}%</span><span>${usd(u.costUsd)}</span><span>${u.charted && u.etaMs != null ? "ETA " + dur(Math.max(0, u.startedAt + u.etaMs - s.now)) : "? frontier"}</span></div>`;
    }
    if (t.kind === "enemy") {
      const e = store.enemy(t.id); if (!e || store.isHidden("enemy", e.id)) return "";
      const c = e.humanOnly ? GOLD : QUAD_COLOR[e.quadrant];
      return `<div class="tt-h">${kindGlyph(e.kind, c, 16)}<b>${esc(e.title)}</b>${e.humanOnly ? `<span class="badge gold">!</span>` : ""}</div><div class="tt-l">${esc(e.reason)}</div>
        <div class="tt-f num"><span style="color:${c}">${esc(KIND_LABEL[e.kind])} · ${esc(QUAD_LABEL[e.quadrant])}</span><span>${e.blocked.length} blocked</span><span>${e.attackers.length} attacking</span></div>`;
    }
    if (t.kind === "planet") {
      const p = s.planets.find((x) => x.id === t.id); if (!p || store.isHidden("planet", p.id)) return "";
      const n = s.units.filter((u) => u.planetId === p.id).length, en = s.enemies.filter((e) => e.planetIds.includes(p.id)).length;
      return `<div class="tt-h"><i class="dot" style="background:${p.color};color:${p.color}"></i><b>${esc(p.name)}</b></div><div class="tt-l">${esc(p.cycle.label)} · ${Math.round(p.progress * 100)}% · ${dur(p.cycle.endAt - s.now)} left</div><div class="tt-f num"><span>${n} units</span><span>${en} enemies</span><span>${p.knowledge} pages</span></div>`;
    }
    if (t.kind === "factory") {
      const f = s.factories.find((x) => x.id === t.id); if (!f) return "";
      return `<div class="tt-h"><b>⚙ ${esc(f.label)}</b></div><div class="tt-f num"><span>every ${dur(f.cadenceMs)}</span><span>${f.paused ? "paused" : "next " + dur(f.nextRunAt - s.now)}</span><span>${f.runs} runs</span></div>`;
    }
    if (t.kind === "mine") {
      const m = s.mines.find((x) => x.id === t.id); if (!m) return "";
      return `<div class="tt-h"><i class="dot" style="background:${m.color};color:${m.color}"></i><b>${esc(m.label)}</b></div><div class="tt-f num"><span>${usd(m.remaining)} / ${usd(m.total)}</span><span>${usd(m.burnPerDay)}/day</span><span>${m.measured ? "measured" : "manual"}</span></div>`;
    }
    if (t.kind === "research") { const r = s.research; return `<div class="tt-h">${tierGlyph("river", 16)}<b>Research Center</b></div><div class="tt-f num"><span>${r.models.length} models</span><span>${r.runs.length} runs</span><span>${r.corrections} corrections</span><span>${esc(r.engine)}</span></div>`; }
    if (t.kind === "sun") { const k = s.knowledge; return `<div class="tt-h"><b>☀ Memory</b></div><div class="tt-f num"><span>${k.pages} pages</span><span>${k.facts} facts</span><span>${k.procedures} procedures</span></div>`; }
    return "";
  }
  store.on("hover", (h) => { cur = h; render(); });
  store.on("state", () => { if (cur.target) render(); });
}

const DOT = `<span class="sep">›</span>`;
export function createTopBar(root: HTMLElement, store: Store) {
  const top = el("header", "topbar glass"); top.setAttribute("aria-label", "Resources");
  top.innerHTML = `<div class="tb-left"></div><div class="tb-mines"></div><div class="tb-right"></div>`;
  root.appendChild(top);
  const left = live(top.querySelector(".tb-left")!); const mines = live(top.querySelector(".tb-mines")!); const right = live(top.querySelector(".tb-right")!);
  function render() {
    const s = store.state; if (!s) return;
    const m = store.mode;
    const planet = m.kind === "planet" ? s.planets.find((p) => p.id === m.planetId) : undefined;
    const crumbs = [`<button class="crumb" data-act="mode" data-k="galaxy">Galaxy</button>`, `<button class="crumb${m.kind === "system" ? " on" : ""}" data-act="mode" data-k="system">${esc(s.company)}</button>`];
    if (planet) crumbs.push(`<span class="crumb on" style="color:${planet.color}">${esc(planet.name)}</span>`);
    if (m.kind === "memory") crumbs.push(`<span class="crumb on" style="color:#FFD166">Memory</span>`);
    const cyc = planet ?? [...s.planets].filter((p) => !store.isHidden("planet", p.id)).sort((a, b) => a.cycle.endAt - b.cycle.endAt)[0];
    left.set(`<span class="brand">C<span>&amp;</span>C</span><nav class="crumbs" aria-label="Breadcrumb">${crumbs.join(DOT)}</nav>
      ${cyc ? `<div class="tb-cycle" title="${esc(cyc.name)} · ${esc(cyc.cycle.label)}"><span class="lbl">${esc(cyc.cycle.label)}</span>${bar(cyc.progress, cyc.color)}<span class="num dim">${dur(cyc.cycle.endAt - s.now)}</span></div>` : ""}`);
    mines.set(s.mines.filter((x) => !store.isHidden("mine", x.id)).map((x) => `<button class="mine" data-act="focus-mine" data-id="${esc(x.id)}" title="${esc(x.label)} · ${x.measured ? "measured" : "manual"}">
      <span class="mine-l"><i class="dot" style="background:${x.color};color:${x.color}"></i>${esc(x.label)}</span>
      <span class="mine-v num">${usd(x.remaining)}<small>−${usd(x.burnPerDay)}/d</small></span>${bar(x.total ? x.remaining / x.total : 0, x.color)}</button>`).join(""));
    const tok = s.units.reduce((a, u) => a + u.tokens.input + u.tokens.output + u.tokens.cacheRead + u.tokens.cacheWrite, 0);
    const cost = s.units.reduce((a, u) => a + u.costUsd, 0);
    const k = s.knowledge;
    right.set(`<div class="stat"><span class="lbl">Tokens</span><b class="num">${kfmt(tok)}</b></div><div class="stat"><span class="lbl">Spend</span><b class="num">${usd(cost)}</b></div>
      <button class="stat knowledge" data-act="focus-sun" title="GBrain pages · facts · Memorable procedures"><span class="lbl">Knowledge</span><b class="num">${k.pages}<i>·</i>${k.facts}<i>·</i>${k.procedures}</b></button>
      ${s.simulated ? `<span class="badge sim" title="Some of this world is simulated">Simulated</span>` : ""}`);
  }
  delegate(top, {
    mode: (t) => { const k = t.dataset.k; store.setMode(k === "galaxy" ? { kind: "galaxy" } : { kind: "system" }); },
    "focus-mine": (t) => store.setFocus({ kind: "mine", id: t.dataset.id! }),
    "focus-sun": () => store.setFocus({ kind: "sun", id: "sun" }),
  });
  store.on("state", render); store.on("mode", render);
}

export function createToasts(root: HTMLElement, store: Store) {
  const box = el("div", "toasts passthru"); box.setAttribute("aria-live", "polite"); root.appendChild(box);
  store.on("toast", (t) => {
    const n = el("div", `toast ${t.level}`, `<i></i><span>${esc(t.text)}</span>`);
    n.addEventListener("click", () => n.remove());
    box.appendChild(n);
    while (box.children.length > 5) box.firstElementChild?.remove();
    setTimeout(() => { n.classList.add("out"); setTimeout(() => n.remove(), 300); }, t.level === "alert" ? 7000 : t.level === "warn" ? 5000 : 3200);
  });
}
