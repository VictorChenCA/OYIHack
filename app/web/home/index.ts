// Home: switch between companies (each company is a galaxy). Owned by slice I3 — stub.
import type { Store } from "../store";
export function createHome(root: HTMLElement, store: Store) {
  store.on("mode", (m) => { root.hidden = m.kind !== "home"; });
}
