// S2 owns web/ui/** and web/style.css. DOM overlay above the Pixi canvas (SPEC §5–§8.1).
import type { Store } from "../store";
import { el } from "./util";
import { createConsole } from "./console";
import { createSide } from "./side";
import { createTooltip, createTopBar, createToasts } from "./hud";
import { applyFixtureOverrides, createOrders, createFilter, createViewTabs, createGroups } from "./command";
import { setModalHost } from "./modal";

export function createUI(root: HTMLElement, store: Store) {
  (window as unknown as { __cc: Store }).__cc = store; // devtools handle
  applyFixtureOverrides(store);
  setModalHost(root);
  createTopBar(root, store);
  createViewTabs(root, store);
  const leftCol = el("div", "leftcol passthru"); root.appendChild(leftCol);
  createOrders(leftCol, store);
  createFilter(leftCol, store);
  createSide(root, store);
  createGroups(root, store);
  createConsole(root, store);
  createToasts(root, store);
  createTooltip(root, store);
  // Mode flag for CSS (memory explorer owns the screen: only top bar + console stay).
  const setMode = () => { root.dataset.mode = store.mode.kind; };
  setMode(); store.on("mode", setMode);
}
