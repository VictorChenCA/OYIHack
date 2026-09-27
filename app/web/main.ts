// Bootstrap. Owned by the main session. Scene = S1 (web/scene), UI = S2 (web/ui), memory explorer = S6 (web/memory).
import { Application } from "pixi.js";
import { store } from "./store";
import { createScene } from "./scene";
import { createUI } from "./ui";
import { createMemory } from "./memory";
import { createHome } from "./home";

const app = new Application();
await app.init({ resizeTo: window, background: "#04060C", antialias: true, resolution: Math.min(2, devicePixelRatio), autoDensity: true });
document.getElementById("stage")!.appendChild(app.canvas);
createScene(app, store);
createUI(document.getElementById("ui")!, store);
createMemory(document.getElementById("memory")!, store);
createHome(document.getElementById("home")!, store);
store.on("mode", (m) => { document.body.dataset.mode = m.kind; });
document.body.dataset.mode = store.mode.kind;
store.connect();
