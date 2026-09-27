// S2 owns web/ui/** and web/style.css. Stub: replace with the full UI (SPEC §7).
import type { Store } from "../store";
export function createUI(root: HTMLElement, store: Store) {
  const bar = document.createElement("div"); bar.className = "stub-bar"; root.appendChild(bar);
  store.on("state", (s) => { bar.textContent = `${s.company} · ${s.units.length} units · ${s.enemies.length} enemies${s.simulated ? " · SIMULATED" : ""}`; });
}
