// Shared, abstract shapes used EVERYWHERE (map, legend, hover, bottom-bar icon) so they always match.
// Owned by the main session. Points are in a unit box (-1..1), nose pointing +x. Scale in the renderer.
import type { Quadrant, Tier } from "../shared/types";

type Pts = [number, number][];

/** Agent hulls by model tier: sleek and abstract; lighter model = lighter shape, heavier model = heavier shape.
 *  Motherships and subagents use the SAME hull (subagents are just drawn smaller). */
export const TIER_HULL: Record<Tier, Pts> = {
  haiku: [[1, 0], [-0.7, 0.42], [-0.35, 0], [-0.7, -0.42]],                               // thin chevron
  sonnet: [[1, 0], [-0.55, 0.6], [-0.75, 0.3], [-0.75, -0.3], [-0.55, -0.6]],             // chevron with body
  opus: [[1, 0], [0.2, 0.55], [-0.8, 0.75], [-0.8, -0.75], [0.2, -0.55]],                 // broad delta
  fable: [[1, 0], [0.45, 0.5], [-0.35, 0.85], [-0.9, 0.55], [-0.9, -0.55], [-0.35, -0.85], [0.45, -0.5]], // heavy hull
  river: [[1, 0], [0, 0.8], [-1, 0], [0, -0.8]],                                          // gem (River-trained)
  unknown: [[1, 0], [-0.55, 0.6], [-0.75, 0.3], [-0.75, -0.3], [-0.55, -0.6]],
};
/** Relative visual mass per tier (map size multiplier). */
export const TIER_SCALE: Record<Tier, number> = { haiku: 0.8, sonnet: 1, opus: 1.2, fable: 1.4, river: 1, unknown: 1 };
export const TIER_LABEL: Record<Tier, string> = { haiku: "Haiku · lightest", sonnet: "Sonnet · standard", opus: "Opus · heavy", fable: "Fable · heaviest", river: "River-trained model", unknown: "Unknown model" };
export const SUBAGENT_SCALE = 0.45;   // subagents: same hull, smaller
export const MOTHERSHIP_SIZE = 16;    // world units (half-width) for a mothership at scale 1

/** Blocker types (the 4 urgency/importance quadrants). Shape + color = type only. Gold ring = needs a person. */
export const QUAD_COLOR: Record<Quadrant, string> = { do_now: "#FF5A5A", schedule: "#FFB547", delegate: "#A78BFA", drop: "#7C8594" };
export const GOLD = "#FFD24A";
export const QUAD_LABEL: Record<Quadrant, [string, string]> = {
  do_now: ["Do now", "Urgent and important: handle first"],
  schedule: ["Schedule", "Important, not urgent: plan it"],
  delegate: ["Delegate", "Urgent, but an agent can take it"],
  drop: ["Drop", "Neither: safe to ignore"],
};
export const QUAD_SHAPE: Record<Quadrant, Pts | "circle"> = {
  do_now: [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i * Math.PI) / 3 + Math.PI / 6), Math.sin((i * Math.PI) / 3 + Math.PI / 6)] as [number, number]), // hexagon
  schedule: [[0, -1], [1, 0], [0, 1], [-1, 0]],        // diamond
  delegate: [[0, -1], [0.95, 0.75], [-0.95, 0.75]],   // triangle
  drop: "circle",                                      // small open circle
};

/** SVG path for a shape (for the UI: legend, hover, bottom-bar icon). size = half-width in px. */
export function svgPath(pts: Pts, size: number, cx = size, cy = size, rot = 0): string {
  const c = Math.cos(rot), s = Math.sin(rot);
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${(cx + (x * c - y * s) * size).toFixed(1)},${(cy + (x * s + y * c) * size).toFixed(1)}`).join(" ") + " Z";
}
export function tierSvg(tier: Tier, color: string, size = 12, rot = -Math.PI / 2): string {
  const w = size * 2;
  return `<svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" aria-hidden="true"><path d="${svgPath(TIER_HULL[tier] ?? TIER_HULL.unknown, size * 0.92, size, size, rot)}" fill="${color}"/></svg>`;
}
export function blockerSvg(q: Quadrant, humanOnly: boolean, size = 10): string {
  const w = size * 2 + 6, c = size + 3, col = QUAD_COLOR[q];
  const shape = QUAD_SHAPE[q];
  const body = shape === "circle"
    ? `<circle cx="${c}" cy="${c}" r="${size * 0.7}" fill="none" stroke="${col}" stroke-width="2"/>`
    : `<path d="${svgPath(shape, size, c, c)}" fill="${col}"/>`;
  const ring = humanOnly ? `<circle cx="${c}" cy="${c}" r="${size + 2}" fill="none" stroke="${GOLD}" stroke-width="1.5"/>` : "";
  return `<svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" aria-hidden="true">${ring}${body}</svg>`;
}
