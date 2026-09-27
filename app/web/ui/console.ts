// Bottom console (SPEC §7): agent mode, commander mode, squad (multi-select) mode.
import type { Store } from "../store";
import type { DeptId, HistoryItem, Unit, UnitDetail, WorldState } from "../../shared/types";
import { el, esc, live, delegate, usd, dur, clock, TIER_COLOR, STATUS_COLOR, MODE_LABEL, GOLD, QUAD_COLOR, QUAD_LABEL } from "./util";
import { tierGlyph, blockerGlyph, CC_EMBLEM } from "./glyphs";
import { openModal } from "./modal";

type ChatLine = { role: "me" | "cmdr"; text: string; at: number };
type Row = { item: HistoryItem; result?: HistoryItem };

const HINTS = ["show everything blocked on credentials", "send 2 sonnets to the rate limit", "hide Marketing", "who is idle?"];

export function createConsole(root: HTMLElement, store: Store) {
  const wrap = el("section", "console glass");
  wrap.setAttribute("aria-label", "Console");
  wrap.innerHTML = `
    <div class="c-resize" role="separator" aria-orientation="horizontal" aria-label="Resize bottom bar" title="Drag to resize · double-click to reset"></div>
    <div class="c-left"></div>
    <header class="c-head"></header>
    <div class="c-body">
      <div class="c-now"></div>
      <div class="c-log" tabindex="-1"></div>
      <div class="c-side"></div>
    </div>
    <form class="c-input" autocomplete="off">
      <span class="c-prompt">&gt;</span>
      <textarea rows="1" spellcheck="false" aria-label="Prompt"></textarea>
      <span class="c-send-hint"></span>
    </form>
    <div class="ctx-pop" hidden></div>`;
  root.appendChild(wrap);

  const left = live(wrap.querySelector(".c-left")!);
  const head = live(wrap.querySelector(".c-head")!);
  const now = live(wrap.querySelector(".c-now")!);
  const logEl = wrap.querySelector<HTMLElement>(".c-log")!;
  const log = live(logEl);
  const form = wrap.querySelector<HTMLFormElement>(".c-input")!;
  const ta = form.querySelector("textarea")!;
  const hint = form.querySelector<HTMLElement>(".c-send-hint")!;
  const pop = wrap.querySelector<HTMLElement>(".ctx-pop")!;

  const sideHost = wrap.querySelector<HTMLElement>(".c-side")!;
  const chat: ChatLine[] = []; let thinking = false;
  let detail: UnitDetail | null = null; let detailFor = ""; let detailTimer: ReturnType<typeof setInterval> | null = null;
  let rows: Row[] = [];
  let lastMode = "";

  const consoleUnitId = (): string | null => {
    const f = store.focus; if (store.selection.length > 1) return null;
    if (f?.kind === "unit") return f.id;
    return store.selection.length === 1 ? store.selection[0]! : null;
  };
  const squad = (): Unit[] => store.selection.length > 1 ? store.selection.map((id) => store.unit(id)).filter((u): u is Unit => !!u) : [];

  function modeKey() {
    const s = squad(); if (s.length > 1) return "squad";
    if (consoleUnitId()) return "agent:" + consoleUnitId();
    const f = store.focus; if (f && f.kind !== "unit") return `side:${f.kind}:${f.id}`;
    return "commander";
  }

  async function loadDetail(id: string, first = false) {
    const d = await store.api<UnitDetail>(`/api/unit/${encodeURIComponent(id)}`);
    if (detailFor !== id) return;
    if (!d && detail && !first) return; // keep what we have (and locally echoed prompts) when offline
    detail = d ?? fixtureDetail(store.unit(id), store.fixture);
    rows = pair(detail.history);
    renderLog(first);
  }

  function setMode() {
    const k = modeKey(); if (k === lastMode) return; lastMode = k;
    wrap.dataset.mode = k.split(":")[0];
    left.reset(); head.reset(); now.reset(); log.reset();
    if (detailTimer) { clearInterval(detailTimer); detailTimer = null; }
    detail = null; rows = []; pop.hidden = true;
    const id = consoleUnitId();
    if (id && k.startsWith("agent")) {
      detailFor = id; loadDetail(id, true);
      detailTimer = setInterval(() => { if (!document.hidden) loadDetail(id); }, 4000);
    } else detailFor = "";
    const pl = store.focus?.kind === "planet" ? store.state?.planets.find((p) => p.id === store.focus!.id) : undefined;
    ta.placeholder = k === "commander" ? "Ask the commander anything…  (Enter to send)" : k === "squad" ? `Message ${store.selection.length} selected agents…` : k.startsWith("side:planet") ? `Start an agent in ${pl?.name ?? "this team"}…  (Enter to start)` : k.startsWith("side:") ? "Ask the commander…  (Esc to go back)" : "Prompt this agent…  (Enter to send · Esc to go back)";
    render(); renderLog(true);
  }

  function render() {
    const s = store.state; if (!s) return;
    const k = modeKey();
    if (k === "squad") return renderSquad(s);
    const id = consoleUnitId(); const u = id ? store.unit(id) : undefined;
    if (u) return renderAgent(s, u);
    if (k.startsWith("side:")) return renderSide(s);
    renderCommander(s);
  }

  function renderAgent(s: WorldState, u: Unit) {
    const frac = u.contextWindow ? Math.min(1, u.contextUsed / u.contextWindow) : 0;
    const proj = s.projects.find((p) => p.id === u.projectId); const col = proj?.color ?? TIER_COLOR[u.tier];
    const R = 44, C = 2 * Math.PI * R;
    const parent = u.parentId ? store.unit(u.parentId) : undefined;
    const mismatch = parent && parent.permissionMode !== u.permissionMode;
    left.set(`<div class="ag" style="--c:${col}"><div class="ctx" tabindex="0" aria-label="Context window ${Math.round(frac * 100)} percent used">
      <svg viewBox="0 0 110 110" class="ctx-ring"><circle cx="55" cy="55" r="${R}" class="ctx-track"/>
        <circle cx="55" cy="55" r="${R}" class="ctx-val" stroke="${col}" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 55 55)"/></svg>
      <div class="ag-core">${tierGlyph(u.tier, 30)}<small class="num">${Math.round(frac * 100)}%</small></div></div>
      <div class="ag-model">${esc(modelName(u))}</div><div class="ag-mode${mismatch ? " warn" : ""}" title="Permission mode${mismatch ? " (differs from mothership)" : ""}">${esc(MODE_LABEL[u.permissionMode])}</div></div>`);
    const kids = u.role === "mothership" ? s.units.filter((x) => x.parentId === u.id && x.status !== "dead") : [];
    head.set(`<div class="c-name"><i class="dot" style="background:${col};color:${col}"></i><span class="c-title">${esc(u.label)}</span><span class="st-word" style="--c:${STATUS_COLOR[u.status === "acting" ? "working" : u.status]}">${esc(statusWord(u))}</span>
        ${parent ? `<button class="chip dim" data-act="focus-unit" data-id="${esc(parent.id)}">subagent of ${esc(parent.label)}</button>` : ""}</div>
`);
    const eta = u.charted ? `known route${u.etaMs != null ? ` · ETA ${dur(Math.max(0, u.startedAt + u.etaMs - s.now))}` : ""}` : "first time · no known route";
    const blk = u.blockedBy ? store.enemy(u.blockedBy) : undefined;
    now.set(`<div class="now-row"><span class="lbl">Doing</span>${u.summary ? `<span class="now-sum">${esc(u.summary)}</span>` : u.task ? `<span class="now-sum">${esc(u.task)}</span>` : `<span class="shimmer">summarizing…</span>`}</div>
      <div class="now-row"><span class="lbl">Heading to</span><span class="trunc">${esc(u.siteLabel ?? u.task ?? "—")}</span><span class="dim num${u.charted ? "" : " fog-t"}">· ${eta}</span>${blk ? `<button class="chip bad" data-act="focus-enemy" data-id="${esc(blk.id)}">blocked by ${esc(blk.title)}</button>` : ""}</div>
      ${kids.length ? `<div class="now-row"><span class="lbl">Subagents</span><span class="kids">${kids.map((k) => `<button class="kid" data-act="focus-unit" data-id="${esc(k.id)}" title="${esc(k.summary ?? k.task ?? "")}"><i class="dot" style="background:${col}"></i>${esc(k.label)}</button>`).join("")}</span></div>` : ""}`);
    hint.textContent = `→ ${u.label}`;
  }

  function renderSide(s: WorldState) {
    const f = store.focus!;
    let icon = ""; let col = "#8A96A8"; let sub = "";
    if (f.kind === "planet") { const p = s.planets.find((x) => x.id === f.id); col = p?.color ?? col; icon = `<span class="planet-orb" style="--c:${col}"></span>`; sub = "team"; }
    else if (f.kind === "enemy") { const e = store.enemy(f.id); col = e?.humanOnly ? GOLD : e ? QUAD_COLOR[e.quadrant] : col; icon = e ? blockerGlyph(e.quadrant, e.humanOnly, 44) : ""; sub = e ? `${QUAD_LABEL[e.quadrant]} · blocking ${e.blocked.length}` : "blocker"; }
    else if (f.kind === "mine") { const m = s.mines.find((x) => x.id === f.id); col = m?.color ?? col; icon = `<span class="planet-orb rock" style="--c:${col}"></span>`; sub = "credits"; }
    else if (f.kind === "research") { col = "#40E0D0"; icon = tierGlyph("river", 40); sub = "research"; }
    else if (f.kind === "sun") { col = "#FFD166"; icon = `<span class="planet-orb" style="--c:${col}"></span>`; sub = "memory"; }
    else if (f.kind === "factory") { col = "#B8F34A"; icon = `<span class="planet-orb rock" style="--c:${col}"></span>`; sub = "factory"; }
    left.set(`<div class="ag side-ic" style="--c:${col}"><div class="ag-ic">${icon}</div><div class="ag-model">${esc(sub)}</div><button class="btn sm ghost" data-act="back">← System</button></div>`);
    head.set(""); now.set("");
    hint.textContent = f.kind === "planet" ? "→ new agent" : "→ commander";
  }

  function renderSquad(s: WorldState) {
    const us = squad();
    const tiers = new Map<string, number>(); us.forEach((u) => tiers.set(u.tier, (tiers.get(u.tier) ?? 0) + 1));
    left.set(`<div class="squad-core"><b class="num">${us.length}</b><span>agents selected</span><div class="squad-tiers">${[...tiers].map(([t, n]) => `<span>${tierGlyph(t as Unit["tier"], 18)}<i class="num">${n}</i></span>`).join("")}</div></div>`);
    head.set(`<div class="c-name"><span class="c-title">Squad</span>
      <span class="chip dim">${usd(us.reduce((a, u) => a + u.costUsd, 0))} spent</span></div>
      <div class="c-stats"><button class="btn ghost" data-act="clear-sel">Clear selection</button></div>`);
    now.set(`<div class="now-row"><span class="lbl">Broadcast</span><span class="dim">Your prompt goes to every selected agent.</span></div>`);
    log.set(`<ul class="squad-list">${us.map((u) => `<li data-act="focus-unit" data-id="${esc(u.id)}" tabindex="0">${tierGlyph(u.tier, 16)}<b>${esc(u.label)}</b><span class="status" style="--c:${STATUS_COLOR[u.status]}"><i></i>${esc(u.status)}</span><span class="dim trunc">${esc(u.summary ?? u.task ?? "")}</span></li>`).join("")}</ul>`);
    hint.textContent = `→ ${us.length} agents`;
    void s;
  }

  function renderCommander(s: WorldState) {
    const vis = s.units.filter((u) => u.status !== "dead" && !store.isHidden("unit", u.id, { planetId: u.planetId, projectId: u.projectId }));
    const working = vis.filter((u) => u.status === "working" || u.status === "acting" || u.status === "attacking").length;
    const ens = s.enemies.filter((e) => !e.resolved && !store.isHidden("enemy", e.id));
    const human = ens.filter((e) => e.humanOnly);
    const teams = s.planets.filter((p) => !store.isHidden("planet", p.id));
    const computed = `${working} agents working · ${ens.length} blocker${ens.length === 1 ? "" : "s"}${human.length ? ` · ${human.length} need${human.length === 1 ? "s" : ""} you` : ""}`;
    left.set(`<div class="cmdr-core">${CC_EMBLEM}<b>Company</b></div>`);
    head.set(`<div class="ov"><span class="ov-ai">${esc(s.overview ?? computed)}</span></div>`);
    now.set(`<div class="depts">${teams.map((p) => `<button class="dept" data-act="focus-planet" data-id="${esc(p.id)}"><i class="dot" style="background:${p.color};color:${p.color}"></i><b>${esc(p.name)}</b><span class="trunc">${esc(p.summary ?? "")}</span></button>`).join("")}</div>`);
    hint.textContent = "→ commander";
  }

  function renderLog(force = false) {
    const k = modeKey();
    if (k === "squad") return;
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
    let html = "";
    if (k === "commander") {
      html = chat.map((c) => `<div class="msg ${c.role}"><span class="who">${c.role === "me" ? "you" : "cmdr"}</span><span class="txt">${esc(c.text)}</span><time class="num">${clock(c.at)}</time></div>`).join("") + (thinking ? `<div class="msg cmdr"><span class="who">cmdr</span><span class="txt shimmer">thinking…</span><time></time></div>` : "");
    } else if (!detail) {
      html = `<div class="dim pad">Loading history…</div>`;
    } else if (!rows.length) {
      html = `<div class="dim pad">No history yet.</div>`;
    } else {
      html = rows.map((r, i) => rowHtml(r, i)).join("");
    }
    log.set(html, force);
    if (atBottom || force) logEl.scrollTop = logEl.scrollHeight;
  }

  function rowHtml(r: Row, i: number) {
    const it = r.item;
    if (it.kind === "tool_use") {
      const err = r.result?.isError;
      return `<div class="hrow tool${err ? " err" : ""}" data-act="open-row" data-i="${i}" tabindex="0"><span class="who">tool</span><span class="txt"><b>${esc(it.toolName ?? "tool")}</b> <span class="dim">${esc(oneLine(it.text, 140))}</span>${r.result ? `<span class="res">↳ ${err ? "error · " : ""}${esc(oneLine(r.result.text, 90))}</span>` : `<span class="res dim">↳ running…</span>`}</span><time class="num">${clock(it.ts)}</time></div>`;
    }
    const cls = it.kind === "prompt" ? "prompt" : it.role === "tool" ? "tool" : "reply";
    return `<div class="hrow ${cls}${it.isError ? " err" : ""}" data-act="open-row" data-i="${i}" tabindex="0"><span class="who">${it.kind === "prompt" ? "you" : it.role === "tool" ? "result" : "agent"}</span><span class="txt">${esc(oneLine(it.text, 260))}</span><time class="num">${clock(it.ts)}</time></div>`;
  }

  async function send() {
    const text = ta.value.trim(); if (!text) return;
    ta.value = ""; autosize();
    const k = modeKey();
    if (k === "commander") {
      chat.push({ role: "me", text, at: Date.now() }); thinking = !store.fixture; renderLog(true); setTimeout(() => { if (thinking) { thinking = false; renderLog(); } }, 45000);
      const r = await store.command({ type: "commander", text });
      if (store.fixture) setTimeout(() => { chat.push({ role: "cmdr", text: `(fixture) Commander would act on: “${text}”`, at: Date.now() }); renderLog(true); }, 500);
      else if (r.ok && (typeof r.data === "string" || typeof (r.data as { reply?: unknown } | undefined)?.reply === "string")) {
        thinking = false; chat.push({ role: "cmdr", text: typeof r.data === "string" ? r.data : String((r.data as { reply: string }).reply), at: Date.now() }); renderLog(true);
      }
      else if (!r.ok) { thinking = false; chat.push({ role: "cmdr", text: `⚠ ${r.message}`, at: Date.now() }); renderLog(true); }
    } else if (k === "squad") {
      await store.command({ type: "prompt", unitIds: [...store.selection], text });
    } else if (k.startsWith("side:planet")) {
      await store.command({ type: "spawn", planetId: store.focus!.id as DeptId, prompt: text });
    } else if (k.startsWith("side:")) {
      chat.push({ role: "me", text, at: Date.now() });
      await store.command({ type: "commander", text });
    } else {
      const id = consoleUnitId(); if (!id) return;
      if (detail) { detail.history.push({ ts: Date.now(), role: "user", kind: "prompt", text }); rows = pair(detail.history); renderLog(true); }
      await store.command({ type: "prompt", unitIds: [id], text });
    }
  }

  function autosize() { ta.style.height = "auto"; ta.style.height = Math.min(88, ta.scrollHeight) + "px"; }
  ta.addEventListener("input", autosize);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    else if (e.key === "Escape") { e.preventDefault(); toCommander(); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); send(); });

  function toCommander() { ta.value = ""; autosize(); store.select([]); store.setFocus(null); ta.blur(); }

  delegate(wrap, {
    hint: (t) => { ta.value = t.dataset.text ?? ""; ta.focus(); autosize(); },
    "clear-sel": () => store.select([]),
    "focus-unit": (t) => store.select([t.dataset.id!]),
    "focus-enemy": (t) => store.setFocus({ kind: "enemy", id: t.dataset.id! }),
    "focus-planet": (t) => store.setFocus({ kind: "planet", id: t.dataset.id as DeptId }),
    back: () => toCommander(),
    "open-row": (t) => {
      const r = rows[Number(t.dataset.i)]; if (!r) return;
      const parts = [`<div class="m-meta"><span class="badge">${esc(r.item.kind)}</span>${r.item.toolName ? `<b>${esc(r.item.toolName)}</b>` : ""}<time class="num dim">${new Date(r.item.ts).toLocaleTimeString()}</time></div><pre>${esc(r.item.text)}</pre>`];
      if (r.result) parts.push(`<div class="m-meta"><span class="badge${r.result.isError ? " warn" : ""}">result${r.result.isError ? " · error" : ""}</span></div><pre>${esc(r.result.text)}</pre>`);
      openModal(r.item.kind === "tool_use" ? `Tool · ${r.item.toolName ?? ""}` : r.item.kind === "prompt" ? "Prompt" : "Reply", parts.join(""));
    },
  });
  logEl.addEventListener("keydown", (e) => { if (e.key === "Enter") (e.target as HTMLElement).click(); });

  // Context hover: files + memory in context.
  const leftEl = wrap.querySelector<HTMLElement>(".c-left")!;
  const showPop = () => {
    if (!lastMode.startsWith("agent")) return;
    const d = detail;
    pop.innerHTML = `<h4>In context</h4>${d ? `<div class="lbl">Files (${d.filesInContext.length})</div><ul>${d.filesInContext.slice(0, 14).map((f) => `<li class="mono">${esc(f)}</li>`).join("") || `<li class="dim">none read</li>`}</ul>
      <div class="lbl">Memory (${d.memoryInContext.length})</div><ul>${d.memoryInContext.slice(0, 10).map((f) => `<li class="mono">${esc(f)}</li>`).join("") || `<li class="dim">no GBrain pages recalled</li>`}</ul>` : `<div class="dim">Loading…</div>`}`;
    pop.hidden = false;
  };
  leftEl.addEventListener("pointerenter", showPop); leftEl.addEventListener("focusin", showPop);
  leftEl.addEventListener("pointerleave", () => { pop.hidden = true; }); leftEl.addEventListener("focusout", () => { pop.hidden = true; });

  // Vertical resize: drag the top edge (min 120px, max 70vh); remembered per viewer; double-click resets.
  const grip = wrap.querySelector<HTMLElement>(".c-resize")!;
  const RKEY = "cc.console.h";
  const clampH = (h: number) => Math.round(Math.max(120, Math.min(window.innerHeight * 0.7, h)));
  const applyH = (h: number | null) => {
    if (h == null) document.documentElement.style.removeProperty("--console-h");
    else document.documentElement.style.setProperty("--console-h", clampH(h) + "px");
    window.dispatchEvent(new Event("resize"));
  };
  try { const v = Number(localStorage.getItem(RKEY)); if (v > 0) applyH(v); } catch { /* storage unavailable */ }
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); wrap.classList.add("resizing");
    const y0 = e.clientY; const h0 = wrap.getBoundingClientRect().height;
    const move = (ev: PointerEvent) => { ev.preventDefault(); applyH(h0 + (y0 - ev.clientY)); };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      wrap.classList.remove("resizing");
      try { localStorage.setItem(RKEY, String(Math.round(wrap.getBoundingClientRect().height))); } catch { /* ignore */ }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  });
  grip.addEventListener("dblclick", () => { applyH(null); try { localStorage.removeItem(RKEY); } catch { /* ignore */ } });

  store.on("state", () => { setMode(); render(); });
  store.on("focus", () => setMode());
  store.on("selection", () => setMode());
  store.on("commander", (text) => { thinking = false; chat.push({ role: "cmdr", text, at: Date.now() }); if (modeKey() === "commander") renderLog(true); });

  // Global: Enter or "/" focuses the console input when not typing elsewhere.
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    const free = t === document.body || t === document.documentElement || t.tagName === "CANVAS";
    if ((e.key === "Enter" || e.key === "/") && free && !e.metaKey && !e.ctrlKey) { e.preventDefault(); ta.focus(); }
    else if (e.key === "Escape" && !document.querySelector(".modal")) {
      toCommander();
    }
  });

  return { focusInput: () => ta.focus(), sideHost };
}

function modelName(u: Unit) {
  const m = u.model ?? u.tier; const x = /(haiku|sonnet|opus|fable)[-\s]?(\d+(?:[.-]\d+)?)?/i.exec(m);
  if (!x) return m; const n = x[1]!; return n[0]!.toUpperCase() + n.slice(1).toLowerCase() + (x[2] ? " " + x[2].replace("-", ".") : "");
}
function statusWord(u: Unit) { return u.status === "attacking" ? "resolving" : u.status === "acting" ? "working" : u.status; }

function oneLine(s: string, n: number) { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; }

function pair(h: HistoryItem[]): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < h.length; i++) {
    const it = h[i]!;
    if (it.kind === "tool_use") { const nx = h[i + 1]; if (nx && nx.kind === "tool_result") { out.push({ item: it, result: nx }); i++; continue; } }
    out.push({ item: it });
  }
  return out;
}

/** Fixture / offline fallback so the console is demoable without /api/unit. */
function fixtureDetail(u: Unit | undefined, fake: boolean): UnitDetail {
  if (!u) return { unitId: "", history: [], filesInContext: [], memoryInContext: [] };
  const t0 = u.startedAt;
  if (!fake) { // live but /api/unit unavailable: only what the unit itself tells us
    const h: HistoryItem[] = [];
    if (u.task) h.push({ ts: t0, role: "user", kind: "prompt", text: u.task });
    if (u.lastTool) h.push({ ts: u.lastEventAt, role: "assistant", kind: "tool_use", toolName: u.lastTool, text: u.lastToolInput ?? "" });
    return { unitId: u.id, history: h, filesInContext: [], memoryInContext: [] };
  }
  const history: HistoryItem[] = [
    { ts: t0, role: "user", kind: "prompt", text: u.task ?? "Continue the task." },
    { ts: t0 + 4000, role: "assistant", kind: "text", text: `On it. I'll start by reading the relevant files for ${u.projectId}.` },
    { ts: t0 + 9000, role: "assistant", kind: "tool_use", toolName: "Read", text: `{"file_path":"app/${u.projectId}/README.md"}` },
    { ts: t0 + 9400, role: "tool", kind: "tool_result", text: `# ${u.projectId}\n\n(fixture) 120 lines…` },
  ];
  if (u.lastTool) history.push({ ts: u.lastEventAt - 800, role: "assistant", kind: "tool_use", toolName: u.lastTool, text: u.lastToolInput ?? "" });
  if (u.status === "blocked") history.push({ ts: u.lastEventAt, role: "assistant", kind: "text", text: "I'm blocked and need help to continue." });
  return { unitId: u.id, history, filesInContext: [`app/${u.projectId}/README.md`, "app/shared/types.ts"], memoryInContext: [`company/${u.planetId}/overview`] };
}
