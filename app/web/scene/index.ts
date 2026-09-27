// S1 owns web/scene/**. Stub: replace with the full renderer (SPEC §3, §9).
import { Application, Graphics } from "pixi.js";
import type { Store } from "../store";
export function createScene(app: Application, store: Store) {
  const g = new Graphics();
  app.stage.addChild(g);
  app.ticker.add(() => {
    const s = store.state; if (!s) return;
    g.clear(); g.position.set(app.screen.width / 2, app.screen.height / 2); g.scale.set(0.35);
    g.circle(0, 0, 90).fill({ color: 0xffc45a });
    for (const p of s.planets) g.circle(p.pos.x, p.pos.y, 40).fill({ color: parseInt(p.color.slice(1), 16) });
    for (const u of s.units) g.circle(u.pos.x, u.pos.y, u.role === "mothership" ? 10 : 5).fill({ color: 0xffffff });
    for (const e of s.enemies) g.circle(e.pos.x, e.pos.y, 14 + 6 * e.blocked.length).fill({ color: e.humanOnly ? 0xffd24a : 0xff4d4d });
  });
}
