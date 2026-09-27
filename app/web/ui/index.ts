// S2 owns web/ui/** and web/style.css. DOM overlay above the Pixi canvas (SPEC §5–§8.1).
import type { Store } from "../store";
import { createConsole } from "./console";
import { createSide } from "./side";
import { setModalHost } from "./modal";

export function createUI(root: HTMLElement, store: Store) {
  setModalHost(root);
  createSide(root, store);
  createConsole(root, store);
}
