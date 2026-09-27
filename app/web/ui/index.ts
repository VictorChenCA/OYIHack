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
  // Left drawers: Orders and Visibility are separate edge tabs; only one open at a time.
  const mkDrawer = (id: string, label: string) => {
    const d = el("aside", `drawer drawer-${id}`); d.setAttribute("aria-label", label);
    const t = el("button", "drawer-tab glass", `<span class="dt-l">${label}</span><b class="dt-n num" hidden></b>`); t.setAttribute("aria-expanded", "false");
    const col = el("div", "leftcol"); d.append(col, t); root.appendChild(d);
    return { d, t, col };
  };
  const ord = mkDrawer("orders", "Orders");
  const vis = mkDrawer("vis", "Visibility");
  createOrders(ord.col, store);
  createFilter(vis.col, store);
  const drawers = { orders: ord, vis } as const;
  type DK = keyof typeof drawers;
  let open: DK | "" = ""; try { const v = localStorage.getItem(DRAWER_KEY); open = v === "1" || v === "orders" ? "orders" : v === "vis" ? "vis" : ""; } catch { /* storage unavailable */ }
  const setOpen = (v: DK | "") => {
    open = v; root.classList.toggle("drawer-any", !!v);
    (Object.keys(drawers) as DK[]).forEach((k) => { const on = k === v; drawers[k].d.classList.toggle("open", on); drawers[k].t.setAttribute("aria-expanded", String(on)); });
    try { localStorage.setItem(DRAWER_KEY, v || "0"); } catch { /* ignore */ }
  };
  setOpen(open);
  (Object.keys(drawers) as DK[]).forEach((k) => drawers[k].t.addEventListener("click", () => setOpen(open === k ? "" : k)));
  const badge = ord.t.querySelector<HTMLElement>(".dt-n")!;
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
