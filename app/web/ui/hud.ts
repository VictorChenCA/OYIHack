// Hover tooltip, top bar, toasts.
import type { Store, Target } from "../store";
import type { DeptId, WorldState } from "../../shared/types";
import { el, esc, live, delegate, usd, dur, TIER_COLOR, QUAD_COLOR, GOLD, STATUS_COLOR, MODE_LABEL } from "./util";
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
        <div class="tt-f num"><span style="color:${TIER_COLOR[u.tier]}">${esc(u.model ?? u.tier)}</span><span>${esc(MODE_LABEL[u.permissionMode])}</span><span>ctx ${ctx}%</span>${u.siteLabel ? `<span>→ ${esc(u.siteLabel)}</span>` : ""}<span>${u.charted && u.etaMs != null ? "ETA " + dur(Math.max(0, u.startedAt + u.etaMs - s.now)) : "first time"}</span></div>`;
    }
    if (t.kind === "enemy") {
      const e = store.enemy(t.id); if (!e || store.isHidden("enemy", e.id)) return "";
      const c = e.humanOnly ? GOLD : QUAD_COLOR[e.quadrant];
      return `<div class="tt-h">${kindGlyph(e.kind, c, 16)}<b>${esc(e.title)}</b></div><div class="tt-l">${esc(e.reason)}</div>
        <div class="tt-f num"><span style="color:${c}">${e.humanOnly ? "needs you" : "blocker"}</span><span>${e.blocked.length} agents waiting</span>${e.attackers.length ? `<span>${e.attackers.length} resolving</span>` : ""}</div>`;
    }
    if (t.kind === "planet") {
      const p = s.planets.find((x) => x.id === t.id); if (!p || store.isHidden("planet", p.id)) return "";
      const n = s.units.filter((u) => u.planetId === p.id).length, en = s.enemies.filter((e) => e.planetIds.includes(p.id)).length;
      return `<div class="tt-h"><i class="dot" style="background:${p.color};color:${p.color}"></i><b>${esc(p.name)}</b></div><div class="tt-l">${esc(p.summary ?? `${n} agents · ${en} blockers`)}</div><div class="tt-f num"><span>${n} agents</span><span>${en} blockers</span><span>${esc(p.cycle.label)} · ${dur(p.cycle.endAt - s.now)} left</span></div>`;
    }
    if (t.kind === "factory") {
      const f = s.factories.find((x) => x.id === t.id); if (!f) return "";
      return `<div class="tt-h"><b>${esc(f.label)}</b></div><div class="tt-f num"><span>every ${dur(f.cadenceMs)}</span><span>${f.paused ? "paused" : "next " + dur(f.nextRunAt - s.now)}</span><span>${f.runs} runs</span></div>`;
    }
    if (t.kind === "mine") {
      const m = s.mines.find((x) => x.id === t.id); if (!m) return "";
      return `<div class="tt-h"><i class="dot" style="background:${m.color};color:${m.color}"></i><b>${esc(m.label)}</b></div><div class="tt-f num"><span>${usd(m.remaining)} / ${usd(m.total)}</span><span>${usd(m.burnPerDay)}/day</span></div>`;
    }
    if (t.kind === "research") { const r = s.research; return `<div class="tt-h">${tierGlyph("river", 16)}<b>Research Center</b></div><div class="tt-f num"><span>${r.models.length} models</span><span>${r.runs.length} runs</span><span>${r.corrections} corrections</span></div>`; }
    if (t.kind === "sun") { const k = s.knowledge; return `<div class="tt-h"><b>Memory</b></div><div class="tt-f num"><span>${k.pages} pages</span><span>${k.facts} facts</span><span>${k.procedures} procedures</span></div>`; }
    return "";
  }
  store.on("hover", (h) => { cur = h; render(); });
  store.on("state", () => { if (cur.target) render(); });
}

const DOT = `<span class="sep">›</span>`;
export function createTopBar(root: HTMLElement, store: Store) {
  const top = el("header", "topbar glass"); top.setAttribute("aria-label", "Navigation");
  top.innerHTML = `<div class="tb-left"></div><div class="tb-right"></div>`;
  root.appendChild(top);
  const left = live(top.querySelector(".tb-left")!); const right = live(top.querySelector(".tb-right")!);
  function render() {
    const s = store.state; if (!s) return;
    const m = store.mode;
    const planet = m.kind === "planet" ? s.planets.find((p) => p.id === m.planetId) : undefined;
    const atGalaxy = m.kind === "system" || m.kind === "galaxy";
    const crumbs = [`<button class="crumb${atGalaxy ? " on" : ""}" data-act="galaxy">Galaxy</button>`];
    if (planet) crumbs.push(`<span class="crumb on"><i class="dot" style="background:${planet.color};color:${planet.color}"></i>${esc(planet.name)}</span>`);
    if (m.kind === "memory") crumbs.push(`<span class="crumb on">Memory</span>`);
    const names = atGalaxy ? `<nav class="tb-planets" aria-label="Departments">${s.planets.filter((p) => !store.isHidden("planet", p.id)).map((p) => `<button class="pl-link" data-act="planet" data-id="${esc(p.id)}" title="${esc(p.summary ?? p.name)}">${esc(p.name)}</button>`).join(`<span class="mid">·</span>`)}</nav>` : "";
    left.set(`<span class="brand">C<span>&amp;</span>C</span><nav class="crumbs" aria-label="Breadcrumb">${crumbs.join(DOT)}</nav>${names ? `<span class="sep">›</span>${names}` : ""}`);
    right.set(s.simulated ? `<span class="badge sim" title="Some of this world is simulated">Simulated</span>` : "");
  }
  delegate(top, {
    galaxy: () => { store.setFocus(null); store.setMode({ kind: "system" }); },
    planet: (t) => { store.setMode({ kind: "planet", planetId: t.dataset.id as DeptId }); store.setFocus({ kind: "planet", id: t.dataset.id as DeptId }); },
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
