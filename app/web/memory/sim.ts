// Grid-accelerated force simulation for the memory graph (no deps).
// World origin = the sun core. Nodes orbit it in angular sectors (one per department / namespace).
import type { DeptId, MemEdge, MemGraph, MemNode } from "../../shared/types";

export interface SNode {
  id: string; n: MemNode; x: number; y: number; vx: number; vy: number;
  deg: number; r: number; group: string; depth: number; ax: number; ay: number; pinned?: boolean; color: string;
}
export interface SEdge { a: SNode; b: SNode; kind: MemEdge["kind"] }

export const PLANET_COLORS: Record<DeptId, string> = { engineering: "#4FD1FF", product_design: "#7C9CFF", arts: "#FF7AD9", marketing: "#5CF2B0" };
export const PLANET_NAMES: Record<DeptId, string> = { engineering: "Engineering", product_design: "Product Design", arts: "Arts", marketing: "Marketing" };
const PLANET_ANGLE: Record<DeptId, number> = { engineering: -Math.PI / 2, product_design: 0, arts: Math.PI / 2, marketing: Math.PI };
export const CORE_R = 70;

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

/** Reference (non-department) nodes: grey with a faint per-namespace tint. */
function refColor(ns: string, sat = 12) {
  const h = Math.floor(hash(ns) * 360);
  return `hsl(${h} ${sat}% 66%)`;
}

export class Sim {
  nodes: SNode[] = [];
  edges: SEdge[] = [];
  byId = new Map<string, SNode>();
  groups: { key: string; angle: number; label: string; color: string; planet?: DeptId }[] = [];
  alpha = 1;

  setGraph(g: MemGraph) {
    const old = this.byId;
    this.byId = new Map();
    const deg = new Map<string, number>();
    for (const e of g.edges) { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); }
    // groups: departments at fixed angles, reference namespaces spread between them
    const refNs = new Map<string, number>();
    for (const n of g.nodes) if (!n.planetId) { const ns = n.slug.split("/")[0]; refNs.set(ns, (refNs.get(ns) ?? 0) + 1); }
    const refKeys = [...refNs.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    this.groups = (Object.keys(PLANET_ANGLE) as DeptId[]).map((p) => ({ key: p, angle: PLANET_ANGLE[p], label: PLANET_NAMES[p], color: PLANET_COLORS[p], planet: p }));
    refKeys.forEach((k, i) => {
      const a = Math.PI / 4 + (i / Math.max(1, refKeys.length)) * Math.PI * 2;
      this.groups.push({ key: "ref:" + k, angle: a, label: k, color: refColor(k) });
    });
    const gAngle = new Map(this.groups.map((x) => [x.key, x.angle]));
    const hasPlanets = g.nodes.some((n) => n.planetId);
    const nGroups = new Set(g.nodes.map((n) => n.planetId ?? "ref:" + n.slug.split("/")[0])).size;
    const sector = Math.min(Math.PI * 1.1, (Math.PI * 2) / Math.max(1, nGroups)) * 0.85;
    const spread = Math.sqrt(g.nodes.length) * 4.5;
    this.nodes = g.nodes.map((n) => {
      const parts = n.slug.split("/");
      const group = n.planetId ?? "ref:" + parts[0];
      const depth = parts.length - 1;
      const sub = n.planetId ? parts[2] ?? "" : parts[1] ?? "";
      const angle = (gAngle.get(group) ?? 0) + (sub ? (hash(sub) - 0.5) * sector : 0) + (hash(n.id + "a") - 0.5) * 0.12;
      const baseR = (n.planetId || !hasPlanets ? 150 : 260) + spread * 0.6;
      const tr = baseR + Math.min(depth, 4) * (18 + spread * 0.12) + hash(n.id + "r") * spread * 0.5 + (n.type === "folder" ? -20 : 0);
      const ax = Math.cos(angle) * tr, ay = Math.sin(angle) * tr;
      const prev = old.get(n.id);
      const d = deg.get(n.id) ?? 0;
      const sn: SNode = {
        id: n.id, n, deg: d, r: Math.min(13, 2.4 + Math.sqrt(d) * 1.5) + (n.type === "folder" ? 0.5 : 0),
        group, depth, ax, ay, color: n.planetId ? PLANET_COLORS[n.planetId] : hasPlanets ? refColor(parts[0]) : refColor(parts.slice(0, 2).join("/"), 34),
        x: prev?.x ?? ax + (hash(n.id + "x") - 0.5) * 160, y: prev?.y ?? ay + (hash(n.id + "y") - 0.5) * 160,
        vx: 0, vy: 0,
      };
      this.byId.set(n.id, sn);
      return sn;
    });
    this.edges = [];
    for (const e of g.edges) { const a = this.byId.get(e.from), b = this.byId.get(e.to); if (a && b && a !== b) this.edges.push({ a, b, kind: e.kind }); }
    this.alpha = old.size ? 0.5 : 1;
  }

  step() {
    const N = this.nodes; if (!N.length) return;
    const alpha = this.alpha;
    this.alpha = Math.max(0.035, alpha * 0.992);
    // repulsion via uniform grid
    const CELL = 80, CUT2 = CELL * CELL, K = 1100 * alpha;
    const grid = new Map<number, SNode[]>();
    const key = (cx: number, cy: number) => (cx + 2048) * 4096 + (cy + 2048);
    for (const n of N) { const k = key(Math.floor(n.x / CELL), Math.floor(n.y / CELL)); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(n); }
    for (const n of N) {
      const cx = Math.floor(n.x / CELL), cy = Math.floor(n.y / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const c = grid.get(key(cx + dx, cy + dy)); if (!c) continue;
        for (const m of c) {
          if (m === n) continue;
          let ddx = n.x - m.x, ddy = n.y - m.y; let d2 = ddx * ddx + ddy * ddy;
          if (d2 > CUT2) continue;
          if (d2 < 0.01) { ddx = (Math.random() - 0.5); ddy = (Math.random() - 0.5); d2 = 0.5; }
          const f = K / d2; n.vx += ddx * f * 0.5; n.vy += ddy * f * 0.5;
        }
      }
    }
    // springs
    for (const e of this.edges) {
      const rest = e.kind === "link" ? 60 : 30; const k = (e.kind === "link" ? 0.02 : 0.05) * alpha;
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - rest) * k / d;
      e.a.vx += dx * f; e.a.vy += dy * f; e.b.vx -= dx * f; e.b.vy -= dy * f;
    }
    // anchors (sector pull) + core exclusion
    for (const n of N) {
      n.vx += (n.ax - n.x) * 0.004 * alpha; n.vy += (n.ay - n.y) * 0.004 * alpha;
      const r = Math.hypot(n.x, n.y); const minR = CORE_R + 40;
      if (r < minR && r > 0.01) { const push = (minR - r) * 0.08; n.vx += (n.x / r) * push; n.vy += (n.y / r) * push; }
    }
    for (const n of N) {
      if (n.pinned) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      const sp = Math.hypot(n.vx, n.vy); if (sp > 30) { n.vx *= 30 / sp; n.vy *= 30 / sp; }
      n.x += n.vx; n.y += n.vy;
    }
  }

  reheat(a = 0.4) { this.alpha = Math.max(this.alpha, a); }
}
