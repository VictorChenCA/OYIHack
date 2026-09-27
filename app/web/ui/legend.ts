// Right-side collapsible legend. Uses shapes.ts so it always matches the map, hover and bottom bar.
import { el } from "./util";
import { tierSvg, blockerSvg, svgPath, TIER_HULL, QUAD_LABEL, GOLD } from "../shapes";
import type { Quadrant, Tier } from "../../shared/types";

const KEY = "cc.legend.open";
const TIERS: [Tier, string][] = [["haiku", "Haiku"], ["sonnet", "Sonnet"], ["opus", "Opus"], ["fable", "Fable"]];
const QS: [Quadrant, string][] = [["do_now", "Urgent and important"], ["schedule", "Important, not urgent"], ["delegate", "Urgent, not important"], ["drop", "Neither"]];
const INK = "#C9D3E0";
const TEAL = "#2DD4BF";

export function createLegend(root: HTMLElement) {
  const box = el("aside", "legend-r"); box.setAttribute("aria-label", "Legend");
  const tab = el("button", "legend-tab glass", "Legend"); tab.setAttribute("aria-expanded", "false");
  const row = (icon: string, name: string, sub = "") => `<li><span class="lr-ic">${icon}</span><b>${name}</b><span>${sub}</span></li>`;
  const svg = (inner: string) => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">${inner}</svg>`;
  const orb = (c: string, r = 6) => svg(`<circle cx="9" cy="9" r="${r}" fill="${c}"/>`);
  const ring = (c: string) => svg(`<circle cx="9" cy="9" r="5" fill="#5B6B80"/><circle cx="15" cy="5" r="2" fill="${c}"/>`);
  const dots = svg(`<line x1="1" y1="9" x2="17" y2="9" stroke="${INK}" stroke-width="1.5" stroke-dasharray="2 3"/>`);
  const rock = svg(`<path d="M4 7 L9 3 L15 6 L14 13 L7 15 L3 11 Z" fill="#8A7A66"/>`);
  const up = -Math.PI / 2;
  // River-trained custom agent: teal gem with a lighter inner facet.
  const gem = svg(`<path d="${svgPath(TIER_HULL.river, 8, 9, 9, up)}" fill="${TEAL}"/>`
    + `<path d="${svgPath(TIER_HULL.river, 4.2, 9, 9, up)}" fill="#A7F3E8" opacity="0.75"/>`
    + `<path d="M9 1 L9 17" stroke="#0F766E" stroke-width="0.8" opacity="0.6"/>`);
  const panel = el("div", "legend-panel glass", `<header class="p-head"><span class="p-title">Legend</span></header>
    <h5>Agents</h5>
    <ul class="lr">${TIERS.map(([t, n]) => row(tierSvg(t, INK, 9), n)).join("")}
      ${row(gem, "Custom", "River-trained")}</ul>
    <h5>Blockers</h5>
    <ul class="lr">${QS.filter(([q]) => q !== "drop").map(([q, d]) => row(blockerSvg(q, false, 7), QUAD_LABEL[q][0], d)).join("")}
      ${row(blockerSvg("schedule", true, 7).replace(/#FFD24A/g, GOLD), "Gold ring", "Needs a person")}</ul>
    <h5>Map</h5>
    <ul class="lr">${row(dots, "Dotted line", "Time elapsed (brighter = done before)")}
      ${row(ring("#B8F34A"), "Moons", "Recurring jobs")}
      ${row(orb("#FFD166", 7), "Sun", "Company memory")}
      ${row(rock, "Credits / Resources", "Budgets")}</ul>`);
  box.append(tab, panel); root.appendChild(box);
  let open = false; try { open = localStorage.getItem(KEY) === "1"; } catch { /* storage unavailable */ }
  const set = (v: boolean) => { open = v; box.classList.toggle("open", v); tab.setAttribute("aria-expanded", String(v)); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ } };
  set(open);
  tab.addEventListener("click", () => set(!open));
}
