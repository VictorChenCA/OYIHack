// Small drawing helpers shared by the scene modules.
import { Graphics, Text, Texture } from "pixi.js";

export const hex = (s: string | undefined, fallback = 0x9fb3c8) => (s && s[0] === "#" ? parseInt(s.slice(1, 7), 16) : fallback);
export const QUAD_COLOR: Record<string, number> = { do_now: 0xff4d4d, schedule: 0xffb020, delegate: 0xa774ff, drop: 0x8a8f98 };
export const GOLD = 0xffd24a;
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
  gr.addColorStop(0, "rgba(4,6,12,0)");
  gr.addColorStop(Math.min(0.95, inner), "rgba(4,6,12,0)");
  gr.addColorStop(Math.min(0.97, inner + 0.12), "rgba(4,6,12,0.45)");
  gr.addColorStop(Math.min(0.98, inner + 0.3), "rgba(4,6,12,0.82)");
  gr.addColorStop(1, "rgba(4,6,12,0.96)");
  x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
  return Texture.from(c);
}

export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };
