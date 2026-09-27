// Hover tooltip, top bar, toasts.
import type { Store, Target } from "../store";
import type { DeptId, WorldState } from "../../shared/types";
import { el, esc, live, delegate, usd, dur, TIER_COLOR, QUAD_COLOR, GOLD } from "./util";

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
    const line = (name: string, sub: string, dot?: string) => `<div class="tt-h">${dot ? `<i class="dot" style="background:${dot};color:${dot}"></i>` : ""}<b>${esc(name)}</b></div>${sub ? `<div class="tt-l">${esc(sub)}</div>` : ""}`;
    if (t.kind === "unit") {
      const u = store.unit(t.id); if (!u || store.isHidden("unit", u.id, { planetId: u.planetId, projectId: u.projectId })) return "";
      const col = s.projects.find((p) => p.id === u.projectId)?.color ?? TIER_COLOR[u.tier];
      return line(u.label, u.summary ?? u.task ?? "", col);
    }
    if (t.kind === "enemy") {
      const e = store.enemy(t.id); if (!e || store.isHidden("enemy", e.id)) return "";
      return line(e.title, e.reason, e.humanOnly ? GOLD : QUAD_COLOR[e.quadrant]);
    }
    if (t.kind === "planet") {
      const p = s.planets.find((x) => x.id === t.id); if (!p || store.isHidden("planet", p.id)) return "";
      return line(p.name, p.summary ?? "", p.color);
    }
    if (t.kind === "factory") { const f = s.factories.find((x) => x.id === t.id); return f ? line(f.label, f.paused ? "paused" : `runs every ${dur(f.cadenceMs)}`) : ""; }
    if (t.kind === "mine") { const m = s.mines.find((x) => x.id === t.id); return m ? line(m.label, `${usd(m.remaining)} left`, m.color) : ""; }
    if (t.kind === "research") return line("Research", "trains the blocker classifier");
    if (t.kind === "sun") return line("Company memory", "click to open", "#FFD166");
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
    const crumbs = [`<button class="crumb${atGalaxy ? " on" : ""}" data-act="galaxy">System</button>`];
    if (planet) crumbs.push(`<span class="crumb on"><i class="dot" style="background:${planet.color};color:${planet.color}"></i>${esc(planet.name)}</span>`);
    if (m.kind === "memory") crumbs.push(`<span class="crumb on">Company memory</span>`);
    const names = atGalaxy ? `<nav class="tb-planets" aria-label="Teams">${s.planets.filter((p) => !store.isHidden("planet", p.id)).map((p) => `<button class="pl-link" data-act="planet" data-id="${esc(p.id)}" title="${esc(p.summary ?? p.name)}">${esc(p.name)}</button>`).join(`<span class="mid">·</span>`)}</nav>` : "";
    left.set(`<span class="brand">C<span>&amp;</span>C</span><nav class="crumbs" aria-label="Breadcrumb">${crumbs.join(DOT)}</nav>${names}`);
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
