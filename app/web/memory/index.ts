// I3: Company memory as a compact REVIEW panel (not a full-screen graph). Shown when store.mode.kind === "memory".
// Map stays visible behind a dim scrim. Feed = state.knowledge.recent writes; search + inline page view via /api/memory/*.
import type { Store } from "../store";
import type { MemoryEvent, WorldState } from "../../shared/types";
import { fakePage } from "./fake";
import { renderMarkdown } from "./md";

type Hit = { slug: string; title: string; snippet: string };

/** Kept for web/ui compatibility: `want: true` stops the UI from redirecting memory mode elsewhere. */
export const memGraph = { want: true };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const ago = (t: number) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

const CSS = `
#memory.mem-review { z-index: 20; }
#memory.mem-review[hidden] { display: none; }
.mr-scrim { position: absolute; inset: 0; background: rgba(2, 4, 9, 0.55); }
.mr-panel { position: absolute; top: 56px; right: 20px; bottom: 20px; width: min(560px, calc(100vw - 40px)); display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(14, 22, 38, 0.96), rgba(8, 13, 24, 0.96)); border: 1px solid var(--line-2, rgba(120,180,255,.3)); border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.55); font: 13px/1.45 var(--sans, "IBM Plex Sans", sans-serif); color: var(--text, #D7E0EA); overflow: hidden; }
.mr-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; border-bottom: 1px solid var(--line, rgba(120,180,255,.16)); }
.mr-head h2 { margin: 0; font: 600 16px/1.2 var(--sans, sans-serif); letter-spacing: .01em; }
.mr-head .mr-count { color: var(--muted, #7D8A99); font-size: 12px; }
.mr-head .mr-x { margin-left: auto; background: transparent; border: 1px solid var(--line, rgba(120,180,255,.16)); color: var(--muted, #7D8A99); border-radius: 6px; padding: 3px 8px; cursor: pointer; font: 12px var(--sans, sans-serif); }
.mr-head .mr-x:hover { color: var(--text, #D7E0EA); border-color: var(--line-2, rgba(120,180,255,.3)); }
.mr-teams { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 16px 0; }
.mr-team { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 9px; border-radius: 999px; background: rgba(120,180,255,.06); border: 1px solid var(--line, rgba(120,180,255,.16)); color: var(--muted, #7D8A99); }
.mr-team b { color: var(--text, #D7E0EA); font-weight: 500; font-variant-numeric: tabular-nums; }
.mr-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--c); }
.mr-search { padding: 10px 16px; }
.mr-search input { width: 100%; box-sizing: border-box; font: 13px/1.3 var(--sans, sans-serif); padding: 8px 10px; }
.mr-body { flex: 1; overflow: auto; padding: 0 8px 12px; }
.mr-sec { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #7D8A99); padding: 8px 8px 6px; }
.mr-item { display: block; width: 100%; text-align: left; background: transparent; border: 0; border-radius: 8px; padding: 8px; color: inherit; font: inherit; cursor: pointer; }
.mr-item:hover, .mr-item:focus-visible { background: rgba(120,180,255,.07); }
.mr-item .t { color: var(--text, #D7E0EA); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.mr-item .m { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 11.5px; color: var(--muted, #7D8A99); }
.mr-item .m .sep { opacity: .5; }
.mr-item.fresh { animation: mr-in .9s ease-out; }
@keyframes mr-in { from { background: rgba(92,242,176,.14); } to { background: transparent; } }
.mr-empty { color: var(--muted, #7D8A99); padding: 10px 8px; font-size: 12.5px; }
.mr-page { padding: 4px 8px; }
.mr-back { background: transparent; border: 0; color: var(--accent, #4FD1FF); cursor: pointer; font: 12px var(--sans, sans-serif); padding: 4px 0 8px; }
.mr-page h1.mr-pt { font: 600 15px/1.3 var(--sans, sans-serif); margin: 0 0 2px; }
.mr-page .mr-slug { font: 11px var(--mono, monospace); color: var(--dim, #5B6675); margin-bottom: 10px; word-break: break-all; }
.mr-md { font-size: 13px; line-height: 1.55; }
.mr-md h2, .mr-md h3, .mr-md h4 { font-size: 13.5px; margin: 14px 0 6px; }
.mr-md p { margin: 0 0 8px; } .mr-md ul, .mr-md ol { margin: 0 0 8px; padding-left: 20px; }
.mr-md code { font: 12px var(--mono, monospace); background: rgba(120,180,255,.08); padding: 1px 4px; border-radius: 4px; }
.mr-md pre { background: rgba(3,6,12,.6); padding: 8px 10px; border-radius: 6px; overflow: auto; }
.mr-md pre code { background: none; padding: 0; }
.mr-md a { color: var(--accent, #4FD1FF); text-decoration: none; }
.mr-md blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 2px solid var(--line-2, rgba(120,180,255,.3)); color: var(--muted, #7D8A99); }
.mr-md hr { border: 0; border-top: 1px solid var(--line, rgba(120,180,255,.16)); }
@media (max-width: 640px) { .mr-panel { top: 12px; right: 12px; left: 12px; bottom: 12px; width: auto; } }
`;

export function createMemory(root: HTMLElement, store: Store) {
  if (!document.getElementById("mr-style")) { const st = document.createElement("style"); st.id = "mr-style"; st.textContent = CSS; document.head.appendChild(st); }
  root.className = "mem-review";
  root.innerHTML = `
    <div class="mr-scrim"></div>
    <section class="mr-panel" role="dialog" aria-label="Company memory">
      <header class="mr-head"><h2>Company memory</h2><span class="mr-count"></span><button class="mr-x" aria-label="Close">Esc ✕</button></header>
      <div class="mr-teams"></div>
      <div class="mr-search"><input type="text" placeholder="Search memory…" spellcheck="false" /></div>
      <div class="mr-body"></div>
    </section>`;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const count = $<HTMLElement>(".mr-count"), teams = $<HTMLElement>(".mr-teams"), body = $<HTMLElement>(".mr-body");
  const input = $<HTMLInputElement>(".mr-search input");

  let view: "feed" | "search" | "page" = "feed";
  let hits: Hit[] = []; let searching = false; let lastQ = "";
  let page: { slug: string; title: string; html: string; loading: boolean } | null = null;
  let prevView: "feed" | "search" = "feed";
  const seen = new Set<string>(); let primed = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const close = () => { if (store.mode.kind === "memory") store.setMode({ kind: "system" }); };
  $<HTMLButtonElement>(".mr-x").onclick = close;
  $<HTMLElement>(".mr-scrim").onclick = close;

  const team = (s: WorldState, id?: string) => s.planets.find((p) => p.id === id);
  const unitLabel = (s: WorldState, id?: string) => (id ? s.units.find((u) => u.id === id)?.label ?? "" : "");
  const evKey = (e: MemoryEvent) => `${e.at}|${e.slug ?? ""}|${e.op}`;

  function renderHeader(s: WorldState) {
    const k = s.knowledge;
    const pages = Math.max(k.pages, s.planets.reduce((a, p) => a + (p.knowledge || 0), 0));
    count.textContent = `${pages} page${pages === 1 ? "" : "s"} · ${k.facts} facts`;
    teams.innerHTML = s.planets.map((p) => `<span class="mr-team" style="--c:${p.color}"><i class="mr-dot"></i>${esc(p.name)} <b>${p.knowledge || 0}</b></span>`).join("");
  }

  let feedSig = "";
  function renderFeed(s: WorldState, force = false) {
    const writes = s.knowledge.recent.filter((e) => e.kind === "write").sort((a, b) => b.at - a.at).slice(0, 40);
    const sig = writes.map((e) => `${e.slug}|${e.text}|${e.unitId}`).join("\n");
    if (!force && sig === feedSig && body.querySelector(".mr-sec")) { // same items: only refresh "time ago" (don't rebuild under the cursor)
      body.querySelectorAll<HTMLElement>("[data-at]").forEach((el, i) => { const e = writes[i]; if (e) { el.dataset.at = String(e.at); el.textContent = ago(e.at); } });
      return;
    }
    feedSig = sig;
    if (!writes.length) { body.innerHTML = `<div class="mr-sec">Recently added</div><div class="mr-empty">Nothing written yet. Agents' memory writes will appear here as they happen.</div>`; return; }
    const rows = writes.map((e) => {
      const k = evKey(e); const fresh = primed && !seen.has(k); seen.add(k);
      const t = team(s, e.planetId); const who = unitLabel(s, e.unitId);
      const text = e.text || e.slug || e.op;
      return `<button class="mr-item${fresh ? " fresh" : ""}" data-slug="${esc(e.slug ?? "")}" data-title="${esc(text)}">
        <div class="t">${esc(text)}</div>
        <div class="m">${t ? `<i class="mr-dot" style="--c:${t.color}"></i>${esc(t.name)}` : ""}${who ? `<span class="sep">·</span>${esc(who)}` : ""}<span class="sep">·</span><span data-at="${e.at}">${ago(e.at)}</span></div>
      </button>`;
    });
    primed = true;
    body.innerHTML = `<div class="mr-sec">Recently added</div>${rows.join("")}`;
  }

  function renderSearch() {
    const head = `<div class="mr-sec">Results for “${esc(lastQ)}”</div>`;
    if (searching && !hits.length) { body.innerHTML = head + `<div class="mr-empty">Searching…</div>`; return; }
    if (!hits.length) { body.innerHTML = head + `<div class="mr-empty">No pages match.</div>`; return; }
    body.innerHTML = head + hits.map((r) => `<button class="mr-item" data-slug="${esc(r.slug)}" data-title="${esc(r.title)}">
      <div class="t">${esc(r.title)}</div><div class="m">${esc(r.snippet || r.slug)}</div></button>`).join("");
  }

  function renderPage() {
    if (!page) return;
    body.innerHTML = `<div class="mr-page"><button class="mr-back">← Back</button>
      <h1 class="mr-pt">${esc(page.title)}</h1><div class="mr-slug">${esc(page.slug)}</div>
      <div class="mr-md">${page.loading ? `<div class="mr-empty">Loading…</div>` : page.html}</div></div>`;
  }

  function render() {
    const s = store.state;
    if (s) renderHeader(s);
    if (view === "page") renderPage();
    else if (view === "search") renderSearch();
    else if (s) renderFeed(s, true);
  }

  async function openPage(slug: string, title: string) {
    if (!slug) return;
    if (view !== "page") prevView = view;
    view = "page"; page = { slug, title, html: "", loading: true }; renderPage();
    let content = "";
    if (store.fixture) content = fakePage(slug, title);
    else {
      const p = await store.api<{ title?: string; content: string; error?: string }>(`/api/memory/page?slug=${encodeURIComponent(slug)}`);
      if (p?.title) title = p.title;
      content = p?.content || (p?.error ? `> Could not load page: ${p.error}` : "> This page isn't available yet.");
    }
    if (!page || page.slug !== slug) return;
    page = { slug, title, html: renderMarkdown(content), loading: false }; renderPage();
    body.scrollTop = 0;
  }

  async function runSearch(q: string) {
    lastQ = q;
    if (!q) { view = "feed"; hits = []; render(); return; }
    view = "search"; searching = true; renderSearch();
    let r: { results: Hit[] } | null = null;
    if (store.fixture) r = { results: [{ slug: "company/engineering/" + q.toLowerCase().replace(/\W+/g, "-"), title: q, snippet: "Fixture result" }] };
    else r = await store.api<{ results: Hit[] }>(`/api/memory/search?q=${encodeURIComponent(q)}`);
    if (lastQ !== q) return;
    hits = r?.results ?? []; searching = false; if (view === "search") renderSearch();
  }

  input.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    const q = input.value.trim();
    searchTimer = setTimeout(() => runSearch(q), 250);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { if (searchTimer) clearTimeout(searchTimer); runSearch(input.value.trim()); }
  });

  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".mr-back")) { view = prevView; page = null; render(); return; }
    const a = t.closest("a[data-slug]") as HTMLElement | null;
    if (a) { e.preventDefault(); openPage(a.dataset.slug!, a.textContent || a.dataset.slug!); return; }
    const item = t.closest(".mr-item") as HTMLElement | null;
    if (item) {
      const slug = item.dataset.slug ?? "";
      if (slug) openPage(slug, item.dataset.title ?? slug);
      else { if (view !== "page") prevView = view; view = "page"; page = { slug: "memory note (no page yet)", title: item.dataset.title ?? "", html: `<p>${esc(item.dataset.title ?? "")}</p>`, loading: false }; renderPage(); }
    }
  });

  // Esc: back out of a page/search first, then close. Capture phase so the console's Esc handler doesn't also fire.
  window.addEventListener("keydown", (e) => {
    if (store.mode.kind !== "memory" || e.key !== "Escape" || document.querySelector(".modal")) return;
    e.preventDefault(); e.stopPropagation();
    if (view === "page") { view = prevView; page = null; render(); return; }
    if (document.activeElement === input && input.value) { input.value = ""; runSearch(""); return; }
    close();
  }, true);

  let lastRender = 0;
  store.on("state", () => {
    if (store.mode.kind !== "memory") return;
    const now = Date.now();
    if (view === "page") { if (store.state) renderHeader(store.state); return; }
    if (view === "search") { if (store.state) renderHeader(store.state); return; }
    if (now - lastRender < 900) return; // fixture ticks at 4Hz; keep the feed calm
    lastRender = now; if (store.state) { renderHeader(store.state); renderFeed(store.state); }
  });

  const onMode = (m: typeof store.mode) => {
    const show = m.kind === "memory";
    root.hidden = !show;
    if (show) { view = "feed"; page = null; input.value = ""; lastQ = ""; hits = []; primed = false; seen.clear(); render(); setTimeout(() => input.focus(), 0); }
  };
  onMode(store.mode); store.on("mode", onMode);
  if (new URLSearchParams(location.search).has("memory")) setTimeout(() => store.setMode({ kind: "memory" }), 0); // ?memory deep link
}
