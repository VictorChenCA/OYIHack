// I3 Home: switch between companies (each company is a galaxy). Shown when store.mode.kind === "home".
import type { Store } from "../store";
import type { WorldState } from "../../shared/types";

type Company = NonNullable<WorldState["companies"]>[number];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const CSS = `
#home.home-root { position: fixed; inset: 0; z-index: 30; overflow: auto; background: radial-gradient(ellipse at 50% 20%, #0B1322 0%, var(--bg, #04060C) 70%);
  color: var(--text, #D7E0EA); font: 14px/1.5 var(--sans, "IBM Plex Sans", sans-serif); }
#home.home-root[hidden] { display: none; }
.hm-wrap { max-width: 920px; margin: 0 auto; padding: 12vh 24px 48px; box-sizing: border-box; }
.hm-brand { display: flex; align-items: center; gap: 12px; }
.hm-logo { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; border: 1px solid var(--line-2, rgba(120,180,255,.3));
  background: rgba(79,209,255,.08); font: 600 13px/1 var(--sans, sans-serif); color: var(--accent, #4FD1FF); letter-spacing: .02em; }
.hm-title { margin: 0; font: 600 30px/1.1 var(--sans, sans-serif); letter-spacing: -.01em; }
.hm-sub { margin: 10px 0 36px; color: var(--muted, #7D8A99); font-size: 15px; }
.hm-sec { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted, #7D8A99); margin-bottom: 10px; }
.hm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.hm-card { text-align: left; display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: 12px; cursor: pointer; color: inherit; font: inherit;
  background: linear-gradient(180deg, rgba(14,22,38,.85), rgba(8,13,24,.85)); border: 1px solid var(--line, rgba(120,180,255,.16)); transition: border-color .15s, transform .15s; }
.hm-card:hover, .hm-card:focus-visible { border-color: var(--line-2, rgba(120,180,255,.3)); transform: translateY(-1px); }
.hm-card.live { border-color: rgba(79,209,255,.35); }
.hm-card .top { display: flex; align-items: center; gap: 8px; }
.hm-card .name { font-weight: 600; font-size: 16px; }
.hm-tag { margin-left: auto; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line, rgba(120,180,255,.16)); color: var(--muted, #7D8A99); white-space: nowrap; }
.hm-tag.live { color: var(--accent-2, #5CF2B0); border-color: rgba(92,242,176,.4); background: rgba(92,242,176,.08); }
.hm-tag.live::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; margin-right: 6px; vertical-align: 1px; }
.hm-stats { display: flex; gap: 22px; }
.hm-stat .v { font: 500 20px/1.1 var(--mono, monospace); font-variant-numeric: tabular-nums; }
.hm-stat .l { font-size: 12px; color: var(--muted, #7D8A99); }
.hm-stat.warn .v { color: var(--warn, #FFB020); }
.hm-open { font-size: 12px; color: var(--muted, #7D8A99); }
.hm-card.live .hm-open { color: var(--accent, #4FD1FF); }
.hm-foot { margin-top: 28px; font-size: 12px; color: var(--dim, #5B6675); }
.hm-foot kbd { font: 11px var(--mono, monospace); border: 1px solid var(--line, rgba(120,180,255,.16)); border-radius: 4px; padding: 1px 5px; }
`;

export function createHome(root: HTMLElement, store: Store) {
  if (!document.getElementById("hm-style")) { const st = document.createElement("style"); st.id = "hm-style"; st.textContent = CSS; document.head.appendChild(st); }
  root.classList.add("home-root");
  root.innerHTML = `<div class="hm-wrap">
    <div class="hm-brand"><div class="hm-logo">C&amp;C</div><h1 class="hm-title">C&amp;C</h1></div>
    <p class="hm-sub">Run a company of AI agents</p>
    <div class="hm-sec">Companies</div>
    <div class="hm-grid"></div>
    <div class="hm-foot"><kbd>Esc</kbd> back to the galaxy view</div>
  </div>`;
  const grid = root.querySelector(".hm-grid") as HTMLElement;
  let lastSig = "";

  const companies = (): Company[] => {
    const s = store.state;
    if (s?.companies?.length) return s.companies;
    const agents = s ? s.units.filter((u) => !u.parentId).length : 0;
    return [{ id: "cc", name: "C&C", agents, blockers: s?.enemies.length ?? 0, live: true }];
  };

  function render(force = false) {
    const list = companies();
    const sig = JSON.stringify(list);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    grid.innerHTML = list.map((c) => `<button class="hm-card${c.live ? " live" : ""}" data-id="${esc(c.id)}" data-live="${c.live ? 1 : 0}">
      <div class="top"><span class="name">${esc(c.name)}</span><span class="hm-tag${c.live ? " live" : ""}">${c.live ? "Live" : "Preview (simulated)"}</span></div>
      <div class="hm-stats">
        <div class="hm-stat"><div class="v">${c.agents}</div><div class="l">agents</div></div>
        <div class="hm-stat${c.blockers ? " warn" : ""}"><div class="v">${c.blockers}</div><div class="l">blockers</div></div>
      </div>
      <div class="hm-open">${c.live ? "Open galaxy view →" : "Preview"}</div>
    </button>`).join("");
  }

  grid.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement).closest(".hm-card") as HTMLElement | null;
    if (!card) return;
    if (card.dataset.live === "1") store.setMode({ kind: "system" });
    else store.toast("Preview company — simulated data isn't wired yet");
  });

  window.addEventListener("keydown", (e) => {
    if (store.mode.kind !== "home" || e.key !== "Escape" || document.querySelector(".modal")) return;
    e.preventDefault(); e.stopPropagation();
    store.setMode({ kind: "system" });
  }, true);

  store.on("state", () => { if (store.mode.kind === "home") render(); });
  const onMode = (m: typeof store.mode) => {
    root.hidden = m.kind !== "home";
    if (m.kind === "home") { render(true); setTimeout(() => (grid.querySelector(".hm-card.live") as HTMLElement | null)?.focus(), 0); }
  };
  onMode(store.mode); store.on("mode", onMode);
}
