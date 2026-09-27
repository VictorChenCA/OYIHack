// Left column: commander assistant (Orders + autonomy), visibility filter + "Hide…" tree. Top center: view tabs.
// Also control groups (keyboard + strip above the console).
import type { Store } from "../store";
import type { Advice, Autonomy, HideFilter, Layer, Stance, Unit, WorldState } from "../../shared/types";
import { el, esc, live, delegate, isTyping, STATUS_COLOR, QUAD_COLOR, GOLD } from "./util";
import { tierGlyph } from "./glyphs";

/** Fixture mode: the fixture world regenerates each tick, so keep UI-driven settings locally so the demo reacts. */
const local: { filter?: HideFilter; autonomy?: Autonomy; view?: string; stances: Record<number, Stance>; groups: Record<string, number[]> } = { stances: {}, groups: {} };
export function applyFixtureOverrides(store: Store) {
  if (!store.fixture) return;
  store.on("state", (s) => {
    if (local.filter) s.filter = local.filter;
    if (local.autonomy) s.autonomy = local.autonomy;
    if (local.view) s.activeViewId = local.view;
    Object.assign(s.stances, local.stances);
    for (const u of s.units) { const g = local.groups[u.id]; if (g) u.groups = g; }
  });
}
function emitLocal(store: Store) { if (store.fixture && store.state) store.emit("state", store.state); }

export function sendFilter(store: Store, f: HideFilter) {
  if (store.fixture) { local.filter = f; if (store.state) store.state.filter = f; emitLocal(store); }
  store.command({ type: "filter", filter: f });
}

// ── Orders + autonomy ──
export function createOrders(parent: HTMLElement, store: Store) {
  const box = el("section", "orders glass"); box.setAttribute("aria-label", "Orders");
  box.innerHTML = `<header class="p-head"><span class="p-title">Orders</span></header><div class="aut"><div class="aut-l">Autonomy</div><div class="seg aut-seg" role="radiogroup" aria-label="Autonomy: how much C&amp;C acts on its own"></div><ul class="aut-help"></ul></div><ol class="quests"></ol>`;
  parent.appendChild(box);
  const seg = live(box.querySelector(".seg")!); const list = live(box.querySelector(".quests")!); const help = live(box.querySelector(".aut-help")!);
  const AUT_HELP: Record<Autonomy, string> = {
    manual: "C&C never acts on its own.",
    assist: "C&C suggests next steps here in Orders (default).",
    auto: "C&C sends the best-ranked agent to blockers that don't need a person.",
  };
  const AUT_NAME: Record<Autonomy, string> = { manual: "Manual", assist: "Assist", auto: "Auto" };
  function render() {
    const s = store.state; if (!s) return;
    seg.set((["manual", "assist", "auto"] as Autonomy[]).map((a) => `<button role="radio" aria-checked="${s.autonomy === a}" class="${s.autonomy === a ? "on" : ""}" data-act="autonomy" data-v="${a}" title="${esc(AUT_HELP[a])}">${AUT_NAME[a]}</button>`).join(""));
    help.set((["manual", "assist", "auto"] as Autonomy[]).map((a) => `<li class="${s.autonomy === a ? "on" : ""}"><b>${AUT_NAME[a]}</b>: ${esc(AUT_HELP[a])}</li>`).join(""));
    const adv = [...s.advice].sort((a, b) => b.priority - a.priority);
    list.set(adv.map((a) => `<li><button class="quest p${a.priority >= 8 ? "hi" : a.priority >= 4 ? "mid" : "lo"}" data-act="advice" data-id="${esc(a.id)}"><i></i><span>${esc(a.text)}</span></button></li>`).join("") || `<li class="dim pad">All clear.</li>`);
  }
  delegate(box, {
    autonomy: (t) => {
      const level = t.dataset.v as Autonomy;
      if (store.fixture) { local.autonomy = level; if (store.state) store.state.autonomy = level; emitLocal(store); }
      store.command({ type: "autonomy", level });
    },
    advice: (t) => { const a = store.state?.advice.find((x) => x.id === t.dataset.id); if (a) runAdvice(store, a); },
  });
  store.on("state", render);
}

function runAdvice(store: Store, a: Advice) {
  if (a.action) { store.command(a.action); return; }
  const s = store.state; if (!s) return;
  const txt = a.text.toLowerCase();
  const en = s.enemies.find((e) => txt.includes(e.title.toLowerCase())); if (en) { store.setFocus({ kind: "enemy", id: en.id }); return; }
  const un = s.units.find((u) => txt.includes(u.label.toLowerCase())); if (un) { store.select([un.id]); return; }
  const pl = s.planets.find((p) => txt.includes(p.name.toLowerCase()));
  if (pl) {
    if (txt.includes("idle")) { const idle = s.units.filter((u) => u.planetId === pl.id && u.status === "idle"); if (idle.length) { store.select(idle.map((u) => u.id)); return; } }
    store.setFocus({ kind: "planet", id: pl.id }); return;
  }
  if (txt.includes("mine") || txt.includes("credit")) { const m = s.mines.find((x) => txt.includes(x.label.toLowerCase().split(" ")[0]!)); if (m) { store.setFocus({ kind: "mine", id: m.id }); return; } }
  if (txt.includes("gold") || txt.includes("human")) { const g = s.enemies.find((e) => e.humanOnly); if (g) { store.setFocus({ kind: "enemy", id: g.id }); return; } }
  if (txt.includes("retrain") || txt.includes("research") || txt.includes("correction")) { store.setFocus({ kind: "research", id: "research" }); return; }
  store.toast(a.text);
}

// ── Visibility: layer toggles + Hide… tree ──
const LAYERS: [Layer, string][] = [["units", "Agents"], ["tethers", "Tethers"], ["enemies", "Blockers"], ["factories", "Factories"], ["mines", "Credits"], ["paths", "Paths"], ["beams", "Memory links"], ["fog", "Fog"], ["labels", "Labels"], ["research", "Research"]];

export function createFilter(parent: HTMLElement, store: Store) {
  const box = el("section", "vis glass"); box.setAttribute("aria-label", "Visibility");
  box.innerHTML = `<header class="p-head"><span class="p-title">Visibility</span><button class="btn sm ghost" data-act="tree" aria-expanded="false">Hide…</button></header><div class="layers"></div><div class="tree" hidden></div>`;
  parent.appendChild(box);
  const layers = live(box.querySelector(".layers")!); const treeEl = box.querySelector<HTMLElement>(".tree")!; const tree = live(treeEl);
  const open = new Set<string>();
  const f = (): HideFilter => { const x = store.state?.filter; return { planets: [...(x?.planets ?? [])], projects: [...(x?.projects ?? [])], units: [...(x?.units ?? [])], enemies: [...(x?.enemies ?? [])], layers: [...(x?.layers ?? [])] }; };
  const toggle = <T,>(arr: T[], v: T) => { const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); return arr; };

  function render() {
    const s = store.state; if (!s) return;
    layers.set(LAYERS.map(([l, name]) => { const on = store.layerOn(l); return `<button class="layer${on ? " on" : ""}" aria-pressed="${on}" data-act="layer" data-l="${l}"><i></i>${name}</button>`; }).join(""));
    if (!treeEl.hidden) tree.set(treeHtml(s));
  }
  function treeHtml(s: WorldState) {
    const fl = s.filter;
    const cb = (kind: string, id: string, hidden: boolean, label: string, extra = "") => `<label class="tr-row${hidden ? " off" : ""}"><input type="checkbox" data-act="hide" data-k="${kind}" data-id="${esc(id)}" ${hidden ? "" : "checked"}>${extra}<span class="trunc">${esc(label)}</span></label>`;
    const planets = s.planets.map((p) => {
      const projs = s.projects.filter((pr) => pr.planetId === p.id);
      const unitsNoProj = s.units.filter((u) => u.planetId === p.id && !projs.some((pr) => pr.id === u.projectId));
      const isOpen = open.has("p:" + p.id);
      return `<div class="tr-grp"><div class="tr-top"><button class="tw" data-act="tw" data-id="p:${p.id}" aria-label="Expand">${isOpen ? "▾" : "▸"}</button>${cb("planets", p.id, fl.planets.includes(p.id), p.name, `<i class="dot" style="background:${p.color};color:${p.color}"></i>`)}</div>
        ${isOpen ? `<div class="tr-kids">${projs.map((pr) => { const po = open.has("j:" + pr.id); const us = s.units.filter((u) => u.projectId === pr.id); return `<div class="tr-top"><button class="tw" data-act="tw" data-id="j:${esc(pr.id)}">${po ? "▾" : "▸"}</button>${cb("projects", pr.id, fl.projects.includes(pr.id), `${pr.name} (${us.length})`, `<i class="dot" style="background:${pr.color};color:${pr.color}"></i>`)}</div>${po ? `<div class="tr-kids">${us.map((u) => cb("units", u.id, fl.units.includes(u.id), u.label, tierGlyph(u.tier, 12))).join("")}</div>` : ""}`; }).join("")}
          ${unitsNoProj.map((u) => cb("units", u.id, fl.units.includes(u.id), u.label, tierGlyph(u.tier, 12))).join("")}</div>` : ""}</div>`;
    }).join("");
    const eo = open.has("enemies");
    const enemies = `<div class="tr-grp"><div class="tr-top"><button class="tw" data-act="tw" data-id="enemies">${eo ? "▾" : "▸"}</button><span class="tr-h">Blockers (${s.enemies.length})</span></div>${eo ? `<div class="tr-kids">${s.enemies.map((e) => cb("enemies", e.id, fl.enemies.includes(e.id), e.title, `<i class="dot" style="background:${e.humanOnly ? GOLD : QUAD_COLOR[e.quadrant]};color:${e.humanOnly ? GOLD : QUAD_COLOR[e.quadrant]}"></i>`)).join("")}</div>` : ""}</div>`;
    const any = fl.planets.length + fl.projects.length + fl.units.length + fl.enemies.length + fl.layers.length;
    return planets + enemies + (any ? `<button class="btn sm ghost showall" data-act="showall">Show everything (${any} hidden)</button>` : "");
  }
  delegate(box, {
    layer: (t) => { const x = f(); toggle(x.layers, t.dataset.l as Layer); sendFilter(store, x); },
    tree: (t) => { treeEl.hidden = !treeEl.hidden; t.setAttribute("aria-expanded", String(!treeEl.hidden)); tree.reset(); render(); },
    tw: (t) => { open.has(t.dataset.id!) ? open.delete(t.dataset.id!) : open.add(t.dataset.id!); tree.reset(); render(); },
    hide: (t) => { const x = f(); const k = t.dataset.k as "planets" | "projects" | "units" | "enemies"; toggle(x[k] as string[], t.dataset.id!); sendFilter(store, x); tree.reset(); },
    showall: () => { sendFilter(store, { planets: [], projects: [], units: [], enemies: [], layers: [] }); tree.reset(); },
  });
  store.on("state", render);
}

export function createViewTabs(root: HTMLElement, store: Store) {
  const tabs = el("nav", "views glass"); tabs.setAttribute("aria-label", "Views"); root.appendChild(tabs);
  const l = live(tabs);
  store.on("state", (s) => {
    l.set(s.views.map((v) => `<button class="vtab${v.id === s.activeViewId ? " on" : ""}${v.source === "commander" ? " cmdr" : ""}" data-act="view" data-id="${esc(v.id)}" aria-pressed="${v.id === s.activeViewId}">${v.source === "commander" ? "✦ " : ""}${esc(v.name)}</button>`).join(""));
  });
  delegate(tabs, { view: (t) => { const id = t.dataset.id!; if (store.fixture) { local.view = id; if (store.state) store.state.activeViewId = id; emitLocal(store); } store.command({ type: "set_view", viewId: id }); } });
}

// ── Control groups ──
export function createGroups(root: HTMLElement, store: Store) {
  const strip = el("div", "groups"); strip.setAttribute("aria-label", "Control groups"); root.appendChild(strip);
  const l = live(strip);
  const members = (s: WorldState, g: number) => s.units.filter((u) => u.groups.includes(g) && u.status !== "dead");
  function render() {
    const s = store.state; if (!s) return;
    const gs = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => ({ g, us: members(s, g) })).filter((x) => x.us.length);
    l.set(gs.length ? gs.map(({ g, us }) => {
      const st = s.stances[g] ?? "assist"; const sel = us.length && us.every((u) => store.selection.includes(u.id));
      const blocked = us.filter((u) => u.status === "blocked").length;
      return `<div class="grp glass${sel ? " on" : ""}"><button class="grp-key" data-act="select" data-g="${g}" title="Select group ${g} (key ${g})"><b class="num">${g}</b><span class="grp-icons">${us.slice(0, 5).map((u) => tierGlyph(u.tier, 12)).join("")}</span><span class="num">${us.length}</span>${blocked ? `<i class="grp-bad" style="background:${STATUS_COLOR.blocked}" title="${blocked} blocked"></i>` : ""}</button>
        <select data-act="stance" data-g="${g}" aria-label="Stance for group ${g}">${(["hold", "auto_attack", "assist"] as Stance[]).map((x) => `<option value="${x}" ${x === st ? "selected" : ""}>${x === "auto_attack" ? "Auto-attack" : x[0]!.toUpperCase() + x.slice(1)}</option>`).join("")}</select></div>`;
    }).join("") : "");
  }
  delegate(strip, { select: (t) => selectGroup(Number(t.dataset.g)) });
  strip.addEventListener("change", (e) => {
    const t = e.target as HTMLSelectElement; if (t.dataset.act !== "stance") return;
    const group = Number(t.dataset.g); const stance = t.value as Stance;
    if (store.fixture) { local.stances[group] = stance; }
    store.command({ type: "stance", group, stance }); t.blur();
  });
  function selectGroup(g: number) {
    const s = store.state; if (!s) return;
    const us = members(s, g).filter((u: Unit) => !store.isHidden("unit", u.id, { planetId: u.planetId, projectId: u.projectId }));
    if (!us.length) { store.toast(`Group ${g} is empty`); return; }
    store.select(us.map((u) => u.id));
  }
  function assign(g: number) {
    const ids = [...store.selection];
    if (!ids.length) { store.toast("Select agents first, then Ctrl/⌘+" + g, "warn"); return; }
    if (store.fixture && store.state) {
      for (const u of store.state.units) { const cur = local.groups[u.id] ?? u.groups; local.groups[u.id] = ids.includes(u.id) ? [...new Set([...cur, g])] : cur.filter((x) => x !== g); }
      emitLocal(store);
    }
    store.command({ type: "group", unitIds: ids, group: g });
  }
  window.addEventListener("keydown", (e) => {
    if (isTyping(e) || e.altKey) return;
    const m = /^Digit([1-9])$/.exec(e.code); if (!m) return;
    const g = Number(m[1]);
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); assign(g); } else if (!e.shiftKey) { e.preventDefault(); selectGroup(g); }
  });
  store.on("state", render); store.on("selection", () => { l.reset(); render(); });
}
