// Client store shared by scene (S1), UI (S2) and memory (S6). Owned by the main session: ask before changing.
import type { Command, CommandResult, DeptId, RankEntry, ServerMsg, Unit, WorldState, Enemy } from "../shared/types";
import { makeFixture } from "./fixture";

export type Mode = { kind: "system" } | { kind: "planet"; planetId: DeptId } | { kind: "memory" } | { kind: "galaxy" } | { kind: "home" }; // system = the company ("Galaxy view (C&C)"); home = company switcher
export type Target =
  | { kind: "unit"; id: string } | { kind: "enemy"; id: string } | { kind: "planet"; id: DeptId } | { kind: "sun"; id: "sun" }
  | { kind: "factory"; id: string } | { kind: "mine"; id: string } | { kind: "research"; id: "research" } | { kind: "sentinel"; id: "sentinel" };
export interface Toast { id: number; text: string; level: "info" | "warn" | "alert"; at: number }

type Events = { state: WorldState; mode: Mode; selection: string[]; focus: Target | null; hover: { target: Target | null; x: number; y: number }; rank: { enemyId: string; entries: RankEntry[] }; toast: Toast; commander: string };
type Handler<K extends keyof Events> = (v: Events[K]) => void;

class Store {
  state: WorldState | null = null;
  mode: Mode = { kind: "system" };
  selection: string[] = [];              // selected unit ids
  focus: Target | null = null;           // entity shown in the side panel / bottom console
  hover: Target | null = null;
  ranks = new Map<string, RankEntry[]>();
  fixture = new URLSearchParams(location.search).has("fixture");
  private handlers: { [K in keyof Events]?: Set<Handler<K>> } = {};
  private toastId = 0;

  on<K extends keyof Events>(ev: K, fn: Handler<K>) { ((this.handlers[ev] ??= new Set() as any) as Set<Handler<K>>).add(fn); return () => (this.handlers[ev] as Set<Handler<K>>).delete(fn); }
  emit<K extends keyof Events>(ev: K, v: Events[K]) { (this.handlers[ev] as Set<Handler<K>> | undefined)?.forEach((f) => f(v)); }

  connect() {
    if (this.fixture) { this.tickFixture(); return; }
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onmessage = (m) => this.receive(JSON.parse(m.data) as ServerMsg);
    ws.onclose = () => setTimeout(() => this.connect(), 1000);
  }
  private tickFixture() { const s = makeFixture(Date.now()); this.receive({ type: "state", state: s }); setTimeout(() => this.tickFixture(), 250); }

  receive(msg: ServerMsg) {
    if (msg.type === "state") { this.state = msg.state; this.emit("state", msg.state); }
    else if (msg.type === "toast") this.toast(msg.text, msg.level);
    else if (msg.type === "rank") { this.ranks.set(msg.enemyId, msg.entries); this.emit("rank", msg); }
    else if (msg.type === "commander") this.emit("commander", msg.text);
  }

  async command(cmd: Command): Promise<CommandResult> {
    if (this.fixture) { this.toast(`(fixture) ${cmd.type}`); return { ok: true, message: "fixture" }; }
    try {
      const r = await fetch("/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cmd) });
      const res = (await r.json()) as CommandResult;
      if (res.message) this.toast(res.message, res.ok ? "info" : "warn");
      return res;
    } catch (e) { this.toast(String(e), "alert"); return { ok: false, message: String(e) }; }
  }
  async api<T>(path: string): Promise<T | null> { if (this.fixture) return null; try { const r = await fetch(path); return r.ok ? ((await r.json()) as T) : null; } catch { return null; } }

  setMode(m: Mode) { this.mode = m; this.emit("mode", m); }
  select(unitIds: string[]) { this.selection = unitIds; this.emit("selection", unitIds); if (unitIds.length === 1) this.setFocus({ kind: "unit", id: unitIds[0] }); }
  setFocus(t: Target | null) { this.focus = t; this.emit("focus", t); if (t?.kind === "enemy") this.loadRank(t.id); }
  setHover(t: Target | null, x: number, y: number) { this.hover = t; this.emit("hover", { target: t, x, y }); }
  toast(text: string, level: Toast["level"] = "info") { this.emit("toast", { id: ++this.toastId, text, level, at: Date.now() }); }
  async loadRank(enemyId: string) { const r = await this.api<RankEntry[]>(`/api/rank/${encodeURIComponent(enemyId)}`); if (r) { this.ranks.set(enemyId, r); this.emit("rank", { enemyId, entries: r }); } }

  unit(id: string): Unit | undefined { return this.state?.units.find((u) => u.id === id); }
  enemy(id: string): Enemy | undefined { return this.state?.enemies.find((e) => e.id === id); }
  /** Hidden by the filter or the active view (SPEC §3.8). Renderers and panels must respect it. */
  isHidden(kind: "unit" | "enemy" | "planet" | "project" | "factory" | "mine", id: string, extra?: { planetId?: string; projectId?: string }): boolean {
    const s = this.state; if (!s) return false;
    const f = s.filter; const view = s.views.find((v) => v.id === s.activeViewId);
    if (view?.hide.includes(id)) return true;
    if (kind === "unit" && (f.units.includes(id) || (extra?.projectId && f.projects.includes(extra.projectId)))) return true;
    if (kind === "enemy" && f.enemies.includes(id)) return true;
    if (kind === "project" && f.projects.includes(id)) return true;
    if (extra?.planetId && f.planets.includes(extra.planetId as DeptId)) return true;
    if (kind === "planet" && f.planets.includes(id as DeptId)) return true;
    return false;
  }
  layerOn(layer: WorldState["filter"]["layers"][number]) { return !(this.state?.filter.layers.includes(layer)); } // filter.layers lists HIDDEN layers
}

export const store = new Store();
export type { Store };
