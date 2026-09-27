// S2 UI helpers: tiny DOM + formatting utilities shared by every panel.
import type { Tier, Quadrant, EnemyKind, UnitStatus, PermissionMode } from "../../shared/types";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e;
}

/** A region re-rendered from state. Skips work when HTML is unchanged, while a pointer is down inside it,
 *  or while a form control inside it has focus (so 4 Hz ticks never eat clicks or typing). */
export function live(node: HTMLElement) {
  let last = ""; let held = false;
  node.addEventListener("pointerdown", () => { held = true; });
  window.addEventListener("pointerup", () => setTimeout(() => { held = false; }, 0));
  return {
    node,
    set(html: string, force = false) {
      if (!force && html === last) return;
      const a = document.activeElement;
      if (!force && (held || (a && node.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)))) return;
      const st = node.scrollTop; node.innerHTML = html; node.scrollTop = st; last = html;
    },
    reset() { last = ""; },
  };
}

/** Delegated click: elements with data-act="name" (+ data-* args) call handlers[name](el, event). */
export function delegate(node: HTMLElement, handlers: Record<string, (t: HTMLElement, e: Event) => void>, evt = "click") {
  node.addEventListener(evt, (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!t || !node.contains(t)) return;
    const fn = handlers[t.dataset.act!]; if (fn) { fn(t, e); }
  });
}

export const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
export function kfmt(v: number) { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M"; if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k"; return String(Math.round(v)); }
export function usd(v: number) { return v >= 100 ? "$" + n0(v) : "$" + v.toFixed(2); }
export function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60); if (h < 48) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
export function ago(ts: number, now = Date.now()) { const d = now - ts; return d < 5000 ? "now" : dur(d) + " ago"; }
export function clock(ts: number) { const d = new Date(ts); return d.toTimeString().slice(0, 5); }

export const TIER_COLOR: Record<Tier, string> = { haiku: "#5CF2B0", sonnet: "#4FD1FF", opus: "#7C9CFF", fable: "#FF7AD9", river: "#40E0D0", unknown: "#8A96A8" };
export const QUAD_COLOR: Record<Quadrant, string> = { do_now: "#FF4D4D", schedule: "#FFB020", delegate: "#A774FF", drop: "#8A8F98" };
export const QUAD_LABEL: Record<Quadrant, string> = { do_now: "Do now", schedule: "Schedule", delegate: "Delegate", drop: "Drop" };
export const GOLD = "#FFD24A";
export const KIND_LABEL: Record<EnemyKind, string> = { credential: "Credential", account: "Account", approval: "Approval", rate_limit: "Rate limit", billing: "Billing", missing_info: "Missing info", dependency: "Dependency", failure: "Failure" };
export const STATUS_COLOR: Record<UnitStatus, string> = { idle: "#8A96A8", working: "#4FD1FF", acting: "#5CF2B0", blocked: "#FF4D4D", attacking: "#FFB020", done: "#B8F34A", dead: "#555E6B" };
export const MODE_LABEL: Record<PermissionMode, string> = { default: "default", acceptEdits: "accept edits", auto: "auto", plan: "plan", bypassPermissions: "bypass", dontAsk: "don't ask", unknown: "?" };

/** Score 0..100 → red→amber→green. */
export function scoreColor(score: number) { const s = Math.max(0, Math.min(100, score)); return `hsl(${Math.round(s * 1.25)}, 85%, 56%)`; }

export function bar(frac: number, color: string, cls = "bar") {
  const f = Math.max(0, Math.min(1, frac || 0));
  return `<span class="${cls}"><i style="width:${(f * 100).toFixed(1)}%;background:${color}"></i></span>`;
}

export function sparkline(values: number[], w = 120, h = 28, color = "#4FD1FF") {
  if (values.length < 2) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
  const mn = Math.min(...values), mx = Math.max(...values), r = mx - mn || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - mn) / r) * (h - 4)).toFixed(1)}`);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${pts[pts.length - 1]!.split(",")[0]}" cy="${pts[pts.length - 1]!.split(",")[1]}" r="2.2" fill="${color}"/></svg>`;
}

export function isTyping(e: KeyboardEvent) { const t = e.target as HTMLElement | null; return !!t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable); }
