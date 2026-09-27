// Small drawing helpers shared by the scene modules.
import { Graphics, Text, Texture } from "pixi.js";

export const hex = (s: string | undefined, fallback = 0x9fb3c8) => (s && s[0] === "#" ? parseInt(s.slice(1, 7), 16) : fallback);
/** The four blocker types = the Eisenhower quadrants. Color + shape encode the quadrant and nothing else. */
export const QUAD_COLOR: Record<string, number> = { do_now: 0xff5a5a, schedule: 0xffb547, delegate: 0xa78bfa, drop: 0x7c8594 };
export const GOLD = 0xffd24a;

/** Blocker glyph in local coords: DO NOW = solid hexagon, SCHEDULE = diamond, DELEGATE = triangle, DROP = small open circle. */
export function drawBlocker(g: Graphics, quadrant: string, r: number, color: number, ui: number) {
  g.clear();
  const w = 1.6 * ui;
  if (quadrant === "drop") { g.circle(0, 0, r).fill({ color: 0x05070d, alpha: 0.6 }).stroke({ width: 2 * ui, color, alpha: 0.95 }); return; }
  let pts: number[];
  if (quadrant === "schedule") pts = [0, -r * 1.1, r * 1.1, 0, 0, r * 1.1, -r * 1.1, 0];
  else if (quadrant === "delegate") { const h = r * 1.15; pts = [0, -h, h * 0.94, h * 0.62, -h * 0.94, h * 0.62]; }
  else { pts = []; for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 3; pts.push(Math.cos(a) * r, Math.sin(a) * r); } }
  g.poly(pts).fill({ color, alpha: quadrant === "do_now" ? 0.92 : 0.8 }).stroke({ width: w, color: 0xffffff, alpha: 0.35 });
}
export const HOLO = 0x9fe8ff;

/** Dashed segment path (one stroke call per line keeps Graphics instructions small). */
export function dashed(g: Graphics, x1: number, y1: number, x2: number, y2: number, dash: number, gap: number, phase = 0) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len, step = dash + gap;
  let s = -((phase % step) + step) % step;
  for (; s < len; s += step) {
    const a = Math.max(0, s), b = Math.min(len, s + dash);
    if (b <= a) continue;
    g.moveTo(x1 + ux * a, y1 + uy * a).lineTo(x1 + ux * b, y1 + uy * b);
  }
}

export function arc(g: Graphics, cx: number, cy: number, r: number, a0: number, a1: number) {
  g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r).arc(cx, cy, r, a0, a1);
}

export function label(text: string, size: number, color = 0xdbe8f5, font = "Rajdhani", weight: "500" | "600" | "700" = "600") {
  const t = new Text({ text, style: { fontFamily: font, fontSize: size, fill: color, fontWeight: weight, letterSpacing: font === "Rajdhani" ? 1.2 : 0.2, dropShadow: { color: 0x000000, alpha: 0.8, blur: 3, distance: 0, angle: 0 } } });
  t.resolution = 2;
  t.anchor.set(0.5);
  return t;
}

/** Fog of war: transparent inside `inner` (fraction of radius), dark beyond. */
export function fogTexture(inner: number): Texture {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const x = c.getContext("2d")!;
  const gr = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  // Softer vignette (lighter cosmos): the frontier still reads as fog, but the system is not boxed in black.
  // Clear inside `inner` (charted space), then a clearly darker band: the fog is the unknown.
  gr.addColorStop(0, "rgba(8,12,24,0)");
  gr.addColorStop(Math.min(0.95, inner), "rgba(8,12,24,0)");
  gr.addColorStop(Math.min(0.96, inner + 0.05), "rgba(8,12,24,0.5)");
  gr.addColorStop(Math.min(0.97, inner + 0.16), "rgba(8,12,24,0.74)");
  gr.addColorStop(Math.min(0.98, inner + 0.35), "rgba(8,12,24,0.88)");
  gr.addColorStop(1, "rgba(8,12,24,0.94)");
  x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
  return Texture.from(c);
}

export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };
