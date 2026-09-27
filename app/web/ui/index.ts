// S2 owns web/ui/** and web/style.css. DOM overlay above the Pixi canvas (SPEC §5–§8.1).
import type { Store } from "../store";
import { el } from "./util";
import { createConsole } from "./console";
import { createSide } from "./side";
import { createTooltip, createTopBar, createToasts } from "./hud";
import { applyFixtureOverrides, createOrders, createFilter } from "./command";
import { createLegend } from "./legend";
import { setModalHost } from "./modal";
import { memGraph } from "../memory";

const DRAWER_KEY = "cc.drawer.open";

export function createUI(root: HTMLElement, store: Store) {
  (window as unknown as { __cc: Store }).__cc = store; // devtools handle
  applyFixtureOverrides(store);
  setModalHost(root);
  // Read-only viewers (remote links): hide every input and action; the server rejects their commands anyway.
  store.api<{ readOnly?: boolean }>("/api/session").then((r) => {
    const ro = !!r?.readOnly;
    document.body.classList.toggle("readonly", ro);
    (store as unknown as { readOnly?: boolean }).readOnly = ro;
    document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(".c-input textarea").forEach((t) => { t.disabled = ro; });
    window.dispatchEvent(new CustomEvent("cc-session", { detail: { readOnly: ro } }));
  }).catch(() => { /* treat as editable */ });
  createTopBar(root, store);
  // Left drawer: views + Orders + Visibility, tucked away by default so the map gets the space.
  const drawer = el("aside", "drawer"); drawer.setAttribute("aria-label", "Orders and visibility");
  const tab = el("button", "drawer-tab glass", `<span class="dt-l">Orders</span><b class="dt-n num" hidden></b>`); tab.setAttribute("aria-expanded", "false");
  const leftCol = el("div", "leftcol");
  drawer.append(leftCol, tab); root.appendChild(drawer);
  createOrders(leftCol, store);
  createFilter(leftCol, store);
  let open = false; try { open = localStorage.getItem(DRAWER_KEY) === "1"; } catch { /* storage unavailable */ }
  const setOpen = (v: boolean) => { open = v; drawer.classList.toggle("open", v); tab.setAttribute("aria-expanded", String(v)); try { localStorage.setItem(DRAWER_KEY, v ? "1" : "0"); } catch { /* ignore */ } };
  setOpen(open);
  tab.addEventListener("click", () => setOpen(!open));
  const badge = tab.querySelector<HTMLElement>(".dt-n")!;
  store.on("state", (s) => { const n = s.advice.length; badge.hidden = !n; badge.textContent = String(n); });

  const con = createConsole(root, store);
  createSide(con.sideHost, store);
  createLegend(root);
  createToasts(root, store);
  createTooltip(root, store);
  // Mode flag for CSS (memory explorer owns the screen: only top bar + console stay).
  // Company memory opens as a compact review in the bottom bar (focus = sun), not the full-screen graph.
  const setMode = () => {
    if (store.mode.kind === "memory" && !memGraph.want) { setTimeout(() => { if (store.mode.kind === "memory" && !memGraph.want) { store.setFocus({ kind: "sun", id: "sun" }); store.setMode({ kind: "system" }); } }, 0); return; }
    root.dataset.mode = store.mode.kind;
  };
  setMode(); store.on("mode", setMode);
}
