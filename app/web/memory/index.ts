// S6: the memory explorer, "enter the sun" (SPEC §3.6). Full-screen overlay over the canvas, under #ui panels.
import type { Store } from "../store";
import type { DeptId, MemGraph, MemoryEvent, WorldState } from "../../shared/types";
import { Sim, CORE_R, PLANET_COLORS, PLANET_NAMES, type SNode } from "./sim";
import { fakeGraph, fakePage } from "./fake";
import { renderMarkdown } from "./md";
import { CSS } from "./style";

type SearchHit = { slug: string; title: string; snippet: string };
interface Pulse { node: SNode | null; t0: number; kind: "read" | "write" }

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function createMemory(root: HTMLElement, store: Store) {
  if (!document.getElementById("mem-style")) { const st = document.createElement("style"); st.id = "mem-style"; st.textContent = CSS; document.head.appendChild(st); }
  root.classList.add("mem-root");
  root.innerHTML = "";
  const canvas = h("canvas", "mem-canvas"); root.appendChild(canvas);
  const ctx2 = canvas.getContext("2d")!;
  const flash = h("div", "mem-flash"); root.appendChild(flash);

  // ── HUD ────────────────────────────────────────────────────────────────
  const top = h("div", "mem-top"); root.appendChild(top);
  const back = h("button", "mem-back", `<span class="k">ESC</span> Back to system`); top.appendChild(back);
  const titleBox = h("div", "mem-title", `<div class="t1">INSIDE THE SUN</div><div class="t2">Company memory · GBrain</div>`); top.appendChild(titleBox);
  const stats = h("div", "mem-stats"); top.appendChild(stats);

  const searchWrap = h("div", "mem-search"); root.appendChild(searchWrap);
  const search = h("input") as HTMLInputElement; search.placeholder = "Search the brain…  ( / )"; search.spellcheck = false; searchWrap.appendChild(search);
  const results = h("div", "mem-results"); searchWrap.appendChild(results);

  const legend = h("div", "mem-legend"); root.appendChild(legend);
  const status = h("div", "mem-status"); root.appendChild(status);
  const hint = h("div", "mem-hint", "drag to pan · scroll to zoom · click a node to read · dbl-click to recenter"); root.appendChild(hint);
  const tip = h("div", "mem-tip"); root.appendChild(tip);

  const drawer = h("aside", "mem-drawer"); root.appendChild(drawer);
  const dHead = h("div", "mem-dhead"); drawer.appendChild(dHead);
  const dBody = h("div", "mem-dbody"); drawer.appendChild(dBody);

  // ── state ──────────────────────────────────────────────────────────────
  const sim = new Sim();
  let graph: MemGraph | null = null; let brain = "";
  let loadedAt = 0; let loading = false; let loadErr = "";
  let visible = false; let raf = 0;
  const cam = { x: 0, y: 0, s: 0.8, rot: 0 };
  let camTarget: { x: number; y: number; s: number } | null = null;
  let hover: SNode | null = null; let selected: SNode | null = null; let dragNode: SNode | null = null;
  let matches: Set<string> | null = null; let hits: SearchHit[] = [];
  const pulses: Pulse[] = [];
  const seenEv = new Set<string>(); let primed = false;
  const hiddenGroups = new Set<string>();
  let W = 0, H = 0, dpr = 1; let openedAt = 0;
  let refetchTimer: ReturnType<typeof setTimeout> | null = null;

  // ── graph loading ──────────────────────────────────────────────────────
  async function load(force = false) {
    if (loading) return; if (!force && graph && Date.now() - loadedAt < 30000) return;
    loading = true; loadErr = ""; renderStatus();
    try {
      let g: (MemGraph & { brain?: string; error?: string }) | null;
      if (store.fixture) { await new Promise((r) => setTimeout(r, 350)); g = { ...fakeGraph(), brain: "fixture" }; }
      else g = await store.api<MemGraph & { brain?: string; error?: string }>("/api/memory/graph");
      if (!g || (!g.nodes?.length && g.error)) throw new Error(g?.error ?? "memory API unreachable");
      graph = g; brain = g.brain ?? "product"; loadedAt = Date.now();
      sim.setGraph(g); renderLegend(); if (matches) applySearchHighlight();
    } catch (e) { loadErr = (e as Error).message; }
    loading = false; renderStatus(); renderStats();
  }
  function scheduleRefetch() { if (refetchTimer || store.fixture) return; refetchTimer = setTimeout(() => { refetchTimer = null; load(true); }, 4000); }

  function renderStatus() {
    status.className = "mem-status" + (loading || loadErr ? " on" : "");
    if (loading && !graph) status.innerHTML = `<div class="spin"></div><div>Descending into the brain…</div>`;
    else if (loadErr && !graph) status.innerHTML = `<div class="err">Brain offline</div><div class="sub">${escHtml(loadErr)}</div><button class="mem-btn" data-retry>Retry</button>`;
    else status.innerHTML = "";
  }
  status.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-retry]")) load(true); });

  function renderStats() {
    const k = store.state?.knowledge;
    const links = graph ? graph.edges.filter((e) => e.kind === "link").length : 0;
    const pages = graph ? graph.nodes.filter((n) => n.type !== "folder").length : 0;
    stats.innerHTML = `
      <div><b>${pages.toLocaleString()}</b><span>pages</span></div>
      <div><b>${links.toLocaleString()}</b><span>links</span></div>
      ${k ? `<div><b>${k.facts}</b><span>facts</span></div><div><b>${k.procedures}</b><span>procedures</span></div>` : ""}
      <div class="brain"><i class="${brain === "dev" ? "dev" : ""}"></i>${escHtml(brain === "dev" ? "dev brain (fallback)" : brain || "…")}</div>`;
  }

  function renderLegend() {
    const counts = new Map<string, number>();
    for (const n of sim.nodes) if (n.n.type !== "folder") counts.set(n.group, (counts.get(n.group) ?? 0) + 1);
    const rows: string[] = [];
    for (const g of sim.groups) {
      if (!g.planet) continue;
      rows.push(`<button data-g="${g.key}" class="${hiddenGroups.has(g.key) ? "off" : ""}"><i style="--c:${g.color}"></i>${g.label}<em>${counts.get(g.key) ?? 0}</em></button>`);
    }
    const refN = [...counts.entries()].filter(([k]) => k.startsWith("ref:")).reduce((a, [, v]) => a + v, 0);
    rows.push(`<button data-g="ref" class="${hiddenGroups.has("ref") ? "off" : ""}"><i style="--c:#8A96A8"></i>Reference<em>${refN}</em></button>`);
    legend.innerHTML = `<div class="lh">DEPARTMENTS</div>${rows.join("")}`;
  }
  legend.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-g]") as HTMLElement | null; if (!b) return;
    const g = b.dataset.g!; hiddenGroups.has(g) ? hiddenGroups.delete(g) : hiddenGroups.add(g); renderLegend();
  });

  // ── visibility (SPEC §3.8 filter + local legend toggles) ──────────────
  function planetHidden(p: DeptId) {
    if (store.isHidden("planet", p)) return true;
    return !!store.state?.planets.find((x) => x.id === p)?.hidden;
  }
  function nodeVisible(n: SNode) {
    if (n.n.planetId) return !planetHidden(n.n.planetId) && !hiddenGroups.has(n.group);
    return !hiddenGroups.has("ref");
  }

  // ── camera ────────────────────────────────────────────────────────────
  const toScreen = (x: number, y: number): [number, number] => {
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    const rx = x * c - y * s, ry = x * s + y * c;
    return [W / 2 + (rx - cam.x) * cam.s, H / 2 + (ry - cam.y) * cam.s];
  };
  const toWorld = (sx: number, sy: number): [number, number] => {
    const rx = (sx - W / 2) / cam.s + cam.x, ry = (sy - H / 2) / cam.s + cam.y;
    const c = Math.cos(-cam.rot), s = Math.sin(-cam.rot);
    return [rx * c - ry * s, rx * s + ry * c];
  };
  function fitView() {
    if (!sim.nodes.length) return;
    let R = 0; for (const n of sim.nodes) if (nodeVisible(n)) R = Math.max(R, Math.hypot(n.x, n.y));
    camTarget = { x: 0, y: 0, s: Math.max(0.12, Math.min(1.4, (Math.min(W, H) * 0.46) / Math.max(200, R))) };
  }
  function focusNode(n: SNode, zoom = true) {
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    camTarget = { x: n.x * c - n.y * s, y: n.x * s + n.y * c, s: zoom ? Math.max(cam.s, 1.5) : cam.s };
  }

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1); W = root.clientWidth || innerWidth; H = root.clientHeight || innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + "px"; canvas.style.height = H + "px";
  }
  addEventListener("resize", () => { if (visible) resize(); });

  // ── pulses from live memory events ─────────────────────────────────────
  function onState(s: WorldState) {
    if (!visible) { primeEvents(s.knowledge?.recent ?? []); return; }
    renderStats();
    if (store.fixture) return; // fixture events are regenerated every tick; synthetic pulses are used instead
    const recent = s.knowledge?.recent ?? [];
    if (!primed) { primeEvents(recent); return; }
    for (const ev of recent) {
      const k = evKey(ev); if (seenEv.has(k)) continue; seenEv.add(k);
      const node = ev.slug ? sim.byId.get(ev.slug) ?? null : null;
      pulses.push({ node, t0: performance.now(), kind: ev.kind });
      if (ev.slug && !node && ev.kind === "write") scheduleRefetch();
    }
    if (seenEv.size > 2000) { seenEv.clear(); primeEvents(recent); }
  }
  const evKey = (e: MemoryEvent) => `${e.at}|${e.op}|${e.slug ?? ""}|${e.unitId ?? ""}`;
  function primeEvents(recent: MemoryEvent[]) { for (const e of recent) seenEv.add(evKey(e)); primed = true; }
  store.on("state", onState);
  let fakeTimer: ReturnType<typeof setInterval> | null = null;

  // ── render loop ────────────────────────────────────────────────────────
  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    sim.step();
    if (camTarget) {
      cam.x += (camTarget.x - cam.x) * 0.12; cam.y += (camTarget.y - cam.y) * 0.12; cam.s += (camTarget.s - cam.s) * 0.12;
      if (Math.abs(camTarget.s - cam.s) < 0.002 && Math.abs(camTarget.x - cam.x) < 0.5 && Math.abs(camTarget.y - cam.y) < 0.5) camTarget = null;
    }
    if (!hover && !dragNode && !selected && !panning) cam.rot += 0.00035; // slow orbit
    draw(t);
  }

  function draw(t: number) {
    const c = ctx2; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#05040A"; c.fillRect(0, 0, W, H);
    const [sx, sy] = toScreen(0, 0);
    const sunPulse = store.state?.sunPulse ?? 0;
    const now = performance.now();
    let boost = 0; for (const p of pulses) if (!p.node) boost = Math.max(boost, 1 - (now - p.t0) / 1200);
    const breathe = 0.5 + 0.5 * Math.sin(t / 1400);
    // plasma field
    const fieldR = Math.max(W, H) * 0.9;
    let g = c.createRadialGradient(sx, sy, 0, sx, sy, fieldR);
    g.addColorStop(0, `rgba(255,170,80,${0.16 + 0.06 * sunPulse})`); g.addColorStop(0.25, "rgba(160,60,30,0.07)"); g.addColorStop(1, "rgba(5,4,10,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // orbit rings
    c.save(); c.lineWidth = 1;
    for (let i = 1; i <= 6; i++) {
      const r = (CORE_R + 60 + i * 95) * cam.s; if (r < 20) continue;
      c.strokeStyle = `rgba(255,190,120,${0.07 - i * 0.008})`; c.setLineDash(i % 2 ? [2, 6] : []);
      c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.stroke();
    }
    c.setLineDash([]); c.restore();
    // sector labels (departments)
    if (store.layerOn("labels")) {
      c.save(); c.font = "600 13px Rajdhani, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      for (const gr of sim.groups) {
        if (!gr.planet || planetHidden(gr.planet) || hiddenGroups.has(gr.key)) continue;
        if (!sim.nodes.some((n) => n.group === gr.key)) continue;
        const R = 150; const [lx, ly] = toScreen(Math.cos(gr.angle) * R, Math.sin(gr.angle) * R);
        c.fillStyle = gr.color; c.globalAlpha = 0.55; c.fillText(gr.label.toUpperCase().split("").join(" "), lx, ly);
      }
      c.restore();
    }
    // core
    const coreR = CORE_R * cam.s * (1 + 0.05 * breathe + 0.18 * boost);
    g = c.createRadialGradient(sx, sy, 0, sx, sy, coreR * 3.2);
    g.addColorStop(0, "rgba(255,248,230,1)"); g.addColorStop(0.18, "rgba(255,214,140,0.95)"); g.addColorStop(0.34, `rgba(255,150,60,${0.55 + 0.3 * boost})`);
    g.addColorStop(0.6, "rgba(220,80,30,0.16)"); g.addColorStop(1, "rgba(120,30,10,0)");
    c.fillStyle = g; c.beginPath(); c.arc(sx, sy, coreR * 3.2, 0, Math.PI * 2); c.fill();

    const visibleNodes = sim.nodes.filter(nodeVisible);
    const vis = new Set(visibleNodes);
    const dimOthers = !!matches || !!selected;
    const neighbors = new Set<SNode>();
    const focusN = hover ?? selected;
    if (focusN) for (const e of sim.edges) { if (e.a === focusN) neighbors.add(e.b); else if (e.b === focusN) neighbors.add(e.a); }

    // edges
    c.save(); c.lineWidth = 1;
    const structural = new Path2D(), links = new Path2D(), hot = new Path2D();
    for (const e of sim.edges) {
      if (!vis.has(e.a) || !vis.has(e.b)) continue;
      const [ax, ay] = toScreen(e.a.x, e.a.y), [bx, by] = toScreen(e.b.x, e.b.y);
      if ((ax < -50 && bx < -50) || (ax > W + 50 && bx > W + 50) || (ay < -50 && by < -50) || (ay > H + 50 && by > H + 50)) continue;
      const p = focusN && (e.a === focusN || e.b === focusN) ? hot : e.kind === "link" ? links : structural;
      p.moveTo(ax, ay); p.lineTo(bx, by);
    }
    const eA = dimOthers ? 0.45 : 1;
    c.setLineDash([2, 4]); c.strokeStyle = `rgba(170,190,220,${0.13 * eA})`; c.stroke(structural);
    c.setLineDash([]); c.strokeStyle = `rgba(255,210,150,${0.28 * eA})`; c.stroke(links);
    c.lineWidth = 1.4; c.strokeStyle = "rgba(255,230,190,0.75)"; c.stroke(hot);
    c.restore();

    // nodes
    const labelsOn = store.layerOn("labels");
    const labelQ: [SNode, number, number, number][] = [];
    c.save();
    for (const n of visibleNodes) {
      const [x, y] = toScreen(n.x, n.y);
      const r = Math.max(1.2, n.r * Math.sqrt(cam.s));
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const isMatch = matches?.has(n.id);
      const lit = n === hover || n === selected || neighbors.has(n) || isMatch;
      let a = dimOthers && !lit ? 0.22 : 1;
      if (matches && !isMatch && n !== selected) a = 0.12;
      c.globalAlpha = a;
      if (n.n.type === "folder") {
        c.strokeStyle = n.color; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
      } else {
        if (lit || r > 5) { c.fillStyle = n.color; c.globalAlpha = a * 0.18; c.beginPath(); c.arc(x, y, r * 2.4, 0, Math.PI * 2); c.fill(); c.globalAlpha = a; }
        c.fillStyle = n.color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      }
      if (isMatch || n === selected) { c.globalAlpha = 1; c.strokeStyle = "#FFE3B0"; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r + 4 + 1.5 * Math.sin(t / 200), 0, Math.PI * 2); c.stroke(); }
      if (labelsOn && (lit || (cam.s * n.r > 7) || (cam.s > 1.6 && n.r * cam.s > 3.5))) labelQ.push([n, x, y, r]);
    }
    c.restore();

    // pulses
    c.save();
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]; const age = (now - p.t0) / 1400;
      if (age > 1) { pulses.splice(i, 1); continue; }
      let px = sx, py = sy, base = coreR;
      if (p.node) { if (!vis.has(p.node)) continue; [px, py] = toScreen(p.node.x, p.node.y); base = p.node.r * Math.sqrt(cam.s); }
      const col = p.kind === "write" ? "255,210,120" : "140,220,255";
      c.strokeStyle = `rgba(${col},${(1 - age) * 0.9})`; c.lineWidth = 2 * (1 - age) + 0.5;
      c.beginPath(); c.arc(px, py, base + 4 + age * (p.node ? 38 : 120), 0, Math.PI * 2); c.stroke();
      if (p.node && age < 0.4) { c.fillStyle = `rgba(${col},${(0.4 - age) * 2})`; c.beginPath(); c.arc(px, py, base + 2, 0, Math.PI * 2); c.fill(); }
    }
    c.restore();

    // labels (greedy de-overlap)
    if (labelQ.length) {
      c.save(); c.font = "500 11px 'IBM Plex Sans', sans-serif"; c.textBaseline = "middle";
      labelQ.sort((a, b) => Number(b[0] === hover || b[0] === selected) - Number(a[0] === hover || a[0] === selected) || b[0].r - a[0].r);
      const boxes: [number, number, number, number][] = [];
      let count = 0;
      for (const [n, x, y, r] of labelQ) {
        if (count > 90) break;
        const text = n.n.title.length > 40 ? n.n.title.slice(0, 38) + "…" : n.n.title;
        const w = c.measureText(text).width; const bx = x + r + 5, by = y - 7;
        if (boxes.some(([x0, y0, w0, h0]) => bx < x0 + w0 && bx + w > x0 && by < y0 + h0 && by + 14 > y0) && n !== hover && n !== selected) continue;
        boxes.push([bx, by, w, 14]); count++;
        c.globalAlpha = matches && !matches.has(n.id) && n !== hover ? 0.35 : 1;
        c.fillStyle = "rgba(5,4,10,0.72)"; c.fillRect(bx - 3, by, w + 6, 14);
        c.fillStyle = n === hover || n === selected ? "#FFF3DE" : "rgba(215,224,234,0.86)"; c.fillText(text, bx, y);
      }
      c.restore();
    }
  }

  // ── pointer ────────────────────────────────────────────────────────────
  let panning = false; let downAt: [number, number] | null = null; let moved = false;
  function pick(mx: number, my: number): SNode | null {
    let best: SNode | null = null, bd = Infinity;
    for (const n of sim.nodes) {
      if (!nodeVisible(n)) continue;
      const [x, y] = toScreen(n.x, n.y); const d = Math.hypot(x - mx, y - my);
      const r = Math.max(1.2, n.r * Math.sqrt(cam.s)) + 5;
      if (d < r && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId); downAt = [e.clientX, e.clientY]; moved = false;
    const n = pick(e.clientX, e.clientY);
    if (n) { dragNode = n; n.pinned = true; } else panning = true;
    camTarget = null;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 3) moved = true;
    if (dragNode && moved) { const [wx, wy] = toWorld(e.clientX, e.clientY); dragNode.x = wx; dragNode.y = wy; sim.reheat(0.15); }
    else if (panning && moved) { cam.x -= e.movementX / cam.s; cam.y -= e.movementY / cam.s; }
    else if (!downAt) {
      const n = pick(e.clientX, e.clientY);
      if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : "grab"; }
      if (n) {
        tip.style.display = "block"; tip.style.left = e.clientX + 14 + "px"; tip.style.top = e.clientY + 12 + "px";
        const dept = n.n.planetId ? PLANET_NAMES[n.n.planetId] : "Reference";
        tip.innerHTML = `<div class="tt">${escHtml(n.n.title)}</div><div class="ts">${escHtml(n.n.slug)}</div><div class="tm"><i style="--c:${n.color}"></i>${dept} · ${n.deg} link${n.deg === 1 ? "" : "s"}${n.n.updatedAt ? " · " + ago(n.n.updatedAt) : ""}</div>`;
      } else tip.style.display = "none";
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    const n = dragNode;
    if (n) { n.pinned = false; if (!moved) openNode(n); }
    else if (!moved && panning) { closeDrawer(); }
    dragNode = null; panning = false; downAt = null;
    if (e.pointerType !== "mouse") { hover = null; tip.style.display = "none"; }
  });
  canvas.addEventListener("pointerleave", () => { if (!downAt) { hover = null; tip.style.display = "none"; } });
  canvas.addEventListener("dblclick", (e) => { if (!pick(e.clientX, e.clientY)) fitView(); });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault(); camTarget = null;
    const [wx0, wy0] = toWorld(e.clientX, e.clientY);
    cam.s = Math.max(0.08, Math.min(6, cam.s * Math.exp(-e.deltaY * 0.0015)));
    const [wx1, wy1] = toWorld(e.clientX, e.clientY);
    // keep the world point under the cursor fixed (in rotated space)
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    const dx = wx0 - wx1, dy = wy0 - wy1; cam.x += dx * c - dy * s; cam.y += dx * s + dy * c;
  }, { passive: false });

  // ── drawer ─────────────────────────────────────────────────────────────
  let pageReq = 0;
  async function openNode(n: SNode) {
    selected = n; focusNode(n, false);
    const dept = n.n.planetId ? PLANET_NAMES[n.n.planetId] : "Reference";
    dHead.innerHTML = `<div class="dk"><i style="--c:${n.color}"></i>${dept}${n.n.type ? " · " + escHtml(n.n.type) : ""}</div>
      <div class="dt">${escHtml(n.n.title)}</div><div class="ds">${escHtml(n.n.slug)}</div>
      <button class="mem-x" title="Close">×</button>`;
    drawer.classList.add("open");
    const kids = sim.edges.filter((e) => e.a === n || e.b === n).map((e) => (e.a === n ? e.b : e.a));
    const related = kids.length ? `<div class="rel"><div class="rh">CONNECTED · ${kids.length}</div>${kids.slice(0, 24).map((k) => `<a href="#" data-slug="${escHtml(k.id)}"><i style="--c:${k.color}"></i>${escHtml(k.n.title)}</a>`).join("")}</div>` : "";
    if (n.n.type === "folder") { dBody.innerHTML = `<p class="muted">Folder: ${kids.length} connected pages.</p>${related}`; return; }
    dBody.innerHTML = `<div class="spin sm"></div>${related}`;
    const my = ++pageReq;
    let content = "";
    if (store.fixture) { await new Promise((r) => setTimeout(r, 150)); content = fakePage(n.n.slug, n.n.title); }
    else {
      const b = brain === "dev" ? "&brain=dev" : "";
      const p = await store.api<{ content: string; error?: string }>(`/api/memory/page?slug=${encodeURIComponent(n.n.slug)}${b}`);
      content = p?.content || (p?.error ? `> Could not load page: ${p.error}` : "> Could not load page.");
    }
    if (my !== pageReq) return;
    dBody.innerHTML = `<article class="md">${renderMarkdown(content)}</article>${related}`;
  }
  function closeDrawer() { drawer.classList.remove("open"); selected = null; }
  drawer.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".mem-x")) { closeDrawer(); return; }
    const a = t.closest("a[data-slug]") as HTMLAnchorElement | null;
    if (a) { e.preventDefault(); gotoSlug(a.dataset.slug!); }
  });
  function gotoSlug(slug: string) {
    const n = sim.byId.get(slug) ?? sim.nodes.find((x) => x.id.endsWith("/" + slug) || x.id.endsWith(slug));
    if (n) { hiddenGroups.delete(n.n.planetId ?? "ref"); focusNode(n); openNode(n); }
    else store.toast(`Page not in graph: ${slug}`, "warn");
  }

  // ── search ─────────────────────────────────────────────────────────────
  let sTimer: ReturnType<typeof setTimeout> | null = null; let sReq = 0;
  search.addEventListener("input", () => { if (sTimer) clearTimeout(sTimer); sTimer = setTimeout(runSearch, 220); });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = hits[0]; if (first) gotoSlug(first.slug); }
    if (e.key === "Escape") { e.stopPropagation(); if (search.value) { search.value = ""; runSearch(); } else search.blur(); }
  });
  async function runSearch() {
    const q = search.value.trim(); const my = ++sReq;
    if (!q) { matches = null; hits = []; renderResults(); return; }
    const ql = q.toLowerCase();
    const local: SearchHit[] = sim.nodes.filter((n) => n.n.title.toLowerCase().includes(ql) || n.n.slug.toLowerCase().includes(ql)).slice(0, 60).map((n) => ({ slug: n.id, title: n.n.title, snippet: n.n.slug }));
    hits = local; applySearchHighlight(); renderResults(true);
    if (store.fixture) { renderResults(); return; }
    const b = brain === "dev" ? "&brain=dev" : "";
    const r = await store.api<{ results: SearchHit[] }>(`/api/memory/search?q=${encodeURIComponent(q)}${b}`);
    if (my !== sReq) return;
    const seen = new Set<string>(); const merged: SearchHit[] = [];
    for (const x of [...(r?.results ?? []), ...local]) if (!seen.has(x.slug)) { seen.add(x.slug); merged.push(x); }
    hits = merged; applySearchHighlight(); renderResults();
  }
  function applySearchHighlight() { matches = hits.length ? new Set(hits.map((x) => x.slug).filter((s) => sim.byId.has(s))) : search.value.trim() ? new Set() : null; }
  function renderResults(pending = false) {
    if (!search.value.trim()) { results.innerHTML = ""; results.classList.remove("on"); return; }
    results.classList.add("on");
    const inGraph = hits.filter((x) => sim.byId.has(x.slug)).length;
    results.innerHTML = `<div class="rh">${hits.length} result${hits.length === 1 ? "" : "s"} · ${inGraph} in graph${pending && !store.fixture ? " · searching…" : ""}</div>` +
      hits.slice(0, 30).map((x) => {
        const n = sim.byId.get(x.slug);
        return `<a href="#" data-slug="${escHtml(x.slug)}"><div class="rt"><i style="--c:${n?.color ?? "#8A96A8"}"></i>${escHtml(x.title)}</div><div class="rs">${escHtml(x.snippet || x.slug)}</div></a>`;
      }).join("");
  }
  results.addEventListener("click", (e) => { const a = (e.target as HTMLElement).closest("a[data-slug]") as HTMLAnchorElement | null; if (a) { e.preventDefault(); gotoSlug(a.dataset.slug!); } });

  // ── open / close ──────────────────────────────────────────────────────
  back.addEventListener("click", () => store.setMode({ kind: "system" }));
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!visible) return;
    if (e.key === "Escape") {
      if (document.activeElement === search) return;
      e.preventDefault();
      if (drawer.classList.contains("open")) closeDrawer(); else store.setMode({ kind: "system" });
    } else if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); search.select(); }
  });

  function show() {
    if (visible) return; visible = true; root.hidden = false; openedAt = performance.now();
    resize(); flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go");
    if (store.state) primeEvents(store.state.knowledge?.recent ?? []);
    const wasEmpty = !graph;
    load().then(() => { if (wasEmpty || cam.s === 0.8) fitView(); });
    if (graph) fitView();
    renderStats(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    if (store.fixture && !fakeTimer) fakeTimer = setInterval(() => {
      if (!sim.nodes.length) return;
      const n = Math.random() < 0.25 ? null : sim.nodes[Math.floor(Math.random() * sim.nodes.length)];
      pulses.push({ node: n, t0: performance.now(), kind: Math.random() < 0.6 ? "read" : "write" });
    }, 900);
  }
  function hide() {
    if (!visible) return; visible = false; root.hidden = true; cancelAnimationFrame(raf);
    tip.style.display = "none"; hover = null;
    if (fakeTimer) { clearInterval(fakeTimer); fakeTimer = null; }
  }
  // periodic refresh while open (server caches 30s)
  setInterval(() => { if (visible && !store.fixture) load(); }, 30000);
  store.on("mode", (m) => (m.kind === "memory" ? show() : hide()));
  if (store.mode.kind === "memory") show(); else root.hidden = true;
  // dev convenience: ?memory opens the explorer directly
  if (new URLSearchParams(location.search).has("memory")) setTimeout(() => store.setMode({ kind: "memory" }), 0);
}

function ago(iso: string) {
  const t = Date.parse(iso); if (!t) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago";
}
export { PLANET_COLORS };
