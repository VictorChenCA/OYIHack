// S2 owns web/ui/** and web/style.css. DOM overlay above the Pixi canvas (SPEC §5–§8.1).
import type { Store } from "../store";
import { el } from "./util";
import { createConsole } from "./console";
import { createSide } from "./side";
import { createTooltip, createTopBar, createToasts } from "./hud";
import { applyFixtureOverrides, createOrders, createFilter, createViewTabs, createGroups } from "./command";
import { setModalHost } from "./modal";

const DRAWER_KEY = "cc.drawer.open";

export function createUI(root: HTMLElement, store: Store) {
  (window as unknown as { __cc: Store }).__cc = store; // devtools handle
  applyFixtureOverrides(store);
  setModalHost(root);
  createTopBar(root, store);
  // Left drawer: views + Orders + Visibility, tucked away by default so the map gets the space.
  const drawer = el("aside", "drawer"); drawer.setAttribute("aria-label", "Orders and visibility");
  const tab = el("button", "drawer-tab glass", `<span class="dt-l">Orders</span><b class="dt-n num" hidden></b>`); tab.setAttribute("aria-expanded", "false");
  const leftCol = el("div", "leftcol");
  drawer.append(leftCol, tab); root.appendChild(drawer);
  createViewTabs(leftCol, store);
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
  createGroups(root, store);
  createToasts(root, store);
  createTooltip(root, store);
  // Mode flag for CSS (memory explorer owns the screen: only top bar + console stay).
  const setMode = () => { root.dataset.mode = store.mode.kind; };
  setMode(); store.on("mode", setMode);
}
