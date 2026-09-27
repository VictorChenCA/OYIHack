// Right-side collapsible legend. Uses shapes.ts so it always matches the map, hover and bottom bar.
import { el } from "./util";
import { tierSvg, blockerSvg, TIER_LABEL, SUBAGENT_SCALE, QUAD_LABEL, GOLD } from "../shapes";
import type { Quadrant, Tier } from "../../shared/types";

const KEY = "cc.legend.open";
const TIERS: Tier[] = ["haiku", "sonnet", "opus", "fable"];
const QS: Quadrant[] = ["do_now", "schedule", "delegate", "drop"];
const INK = "#C9D3E0";

export function createLegend(root: HTMLElement) {
  const box = el("aside", "legend-r"); box.setAttribute("aria-label", "Legend");
  const tab = el("button", "legend-tab glass", "Legend"); tab.setAttribute("aria-expanded", "false");
  const row = (icon: string, name: string, sub: string) => `<li><span class="lr-ic">${icon}</span><b>${name}</b><span>${sub}</span></li>`;
  const orb = (c: string, r = 6) => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="${r}" fill="${c}"/></svg>`;
  const ring = (c: string) => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="5" fill="#5B6B80"/><circle cx="15" cy="5" r="2" fill="${c}"/></svg>`;
  const dots = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><line x1="1" y1="9" x2="17" y2="9" stroke="${INK}" stroke-width="1.5" stroke-dasharray="2 3"/></svg>`;
  const rock = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 7 L9 3 L15 6 L14 13 L7 15 L3 11 Z" fill="#8A7A66"/></svg>`;
  const panel = el("div", "legend-panel glass", `<header class="p-head"><span class="p-title">Legend</span></header>
    <h5>Agents · by model</h5>
    <ul class="lr">${TIERS.map((t) => row(tierSvg(t, INK, 9), TIER_LABEL[t].split(" · ")[0]!, TIER_LABEL[t].split(" · ")[1] ?? "")).join("")}</ul>
    <p class="lr-note">Lighter model = lighter shape. Color = the project it works on.</p>
    <ul class="lr">${row(tierSvg("sonnet", INK, 9), "Mothership", "a top-level agent")}${row(tierSvg("sonnet", INK, Math.max(4, Math.round(9 * SUBAGENT_SCALE))), "Subagent", "same hull, smaller")}</ul>
    <h5>Blockers</h5>
    <ul class="lr">${QS.map((q) => row(blockerSvg(q, false, 7), QUAD_LABEL[q][0], QUAD_LABEL[q][1])).join("")}
      ${row(blockerSvg("schedule", true, 7).replace(/#FFD24A/g, GOLD), "Gold ring", "needs a person")}
      ${row(orb("#8A8F98", 7), "Size", "how many agents it blocks")}</ul>
    <h5>Map</h5>
    <ul class="lr">${row(dots, "Dotted line", "time: length = expected duration; fades into fog if never done")}
      ${row(ring("#B8F34A"), "Moons", "recurring jobs")}
      ${row(orb("#FFD166", 7), "Sun", "company memory")}
      ${row(rock, "Asteroids", "credits")}</ul>`);
  box.append(tab, panel); root.appendChild(box);
  let open = false; try { open = localStorage.getItem(KEY) === "1"; } catch { /* storage unavailable */ }
  const set = (v: boolean) => { open = v; box.classList.toggle("open", v); tab.setAttribute("aria-expanded", String(v)); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ } };
  set(open);
  tab.addEventListener("click", () => set(!open));
}
