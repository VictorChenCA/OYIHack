// S6 owns web/memory/**. Stub: replace with the enter-the-sun memory explorer (SPEC §3.6).
import type { Store } from "../store";
export function createMemory(root: HTMLElement, store: Store) {
  store.on("mode", (m) => { root.hidden = m.kind !== "memory"; });
}
