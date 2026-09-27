// S1 Scene: Pixi v8 "tactical hologram" renderer for the C&C world (SPEC §3, §5, §6, §8, §9).
import { Application, Container, Graphics, Sprite, Text, TilingSprite, type Filter } from "pixi.js";
import type { DeptId, Enemy, Planet, Unit, WorldState } from "../../shared/types";
import type { Store, Target } from "../store";
import { loadTextures, tex, type TexName } from "./assets";
import { Camera } from "./camera";
import { GOLD, HOLO, QUAD_COLOR, arc, dashed, fogTexture, hash, hex, label } from "./draw";

const PLANET_TEX: Record<DeptId, TexName> = { engineering: "planet07", marketing: "planet02", product_design: "planet01", arts: "planet09" };
const TIER_TEX: Record<string, TexName> = { haiku: "ship_A", sonnet: "ship_B", opus: "ship_E", fable: "ship_H", river: "meteor_squareLarge", unknown: "ship_B" };
const PLANET_R = 70, SUN_R = 95;

function sprite(name: TexName, opts: { tint?: number; add?: boolean; size?: number; alpha?: number } = {}) {
  const s = new Sprite(tex[name]); s.anchor.set(0.5);
  if (opts.tint !== undefined) s.tint = opts.tint;
  if (opts.add) s.blendMode = "add";
  if (opts.size) s.scale.set(opts.size / Math.max(1, s.texture.width));
  if (opts.alpha !== undefined) s.alpha = opts.alpha;
  return s;
}
const setSize = (s: Sprite, size: number) => s.scale.set(size / Math.max(1, s.texture.width));

interface UnitView { glow: Sprite; trail: Sprite; ship: Sprite; x: number; y: number; rot: number; texName: TexName; seen: number }
interface EnemyView { c: Container; title: Text; aura: Sprite; hull: Sprite; halo: Sprite; badge: Text; drones: Sprite[]; smoke: Sprite; x: number; y: number; seen: number; kind: string; last: Enemy; born: number }
interface PlanetView { c: Container; base: Sprite; dept: Sprite; lights: Sprite[]; ring: Graphics; dish: Sprite; name: Text; cycle: Text }
interface Fx { s: Sprite; t: number; dur: number; from: number; to: number; alpha: number }

export function createScene(app: Application, store: Store) {
  const root = new Container(); app.stage.addChild(root);
  const bg = new Container(); root.addChild(bg);
  const world = new Container(); root.addChild(world);
  const top = new Container(); root.addChild(top); // labels: same camera transform, outside bloom
  const hud = new Graphics(); root.addChild(hud);
  const cam = new Camera(app, world);
  let built = false, fitted = false, time = 0;

  const fonts = Promise.race([
    Promise.all(['600 16px Rajdhani', '700 16px Rajdhani', '500 12px "IBM Plex Sans"', '500 12px "JetBrains Mono"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});
  Promise.all([loadTextures(), fonts]).then(build).catch((e) => console.error("[scene] asset load failed", e));

  // ---------- layers ----------
  const L = {
    orbits: new Graphics(), belt: new Container(), beams: new Graphics(), packets: new Container(), paths: new Graphics(),
    sun: new Container(), research: new Container(), planets: new Container(), factories: new Container(), mines: new Container(),
    tethers: new Graphics(), enemies: new Container(), unitGlow: new Container(), units: new Container(), overlay: new Graphics(),
    fx: new Container(), fog: new Container(), labels: new Container(),
  };
  for (const k of Object.keys(L) as (keyof typeof L)[]) (k === "labels" ? top : world).addChild(L[k]);
  L.beams.blendMode = "add"; L.unitGlow.blendMode = "add";

  let nebula: TilingSprite, stars1: TilingSprite, stars2: TilingSprite, fog: Sprite;
  const smoke: Sprite[] = [];
  const sun = {} as { core: Sprite; l1: Sprite; l2: Sprite; halo: Sprite; ring: Sprite; flash: number };
  const research = {} as { gem: Sprite; shards: Sprite[]; twinkle: Sprite; glow: Sprite; name: Text };
  const planetViews = new Map<string, PlanetView>();
  const unitViews = new Map<string, UnitView>();
  const enemyViews = new Map<string, EnemyView>();
  const factoryViews = new Map<string, { s: Sprite; name: Text }>();
  const mineViews = new Map<string, { s: Sprite; glow: Sprite; name: Text; val: Text }>();
  const texts = new Map<string, { t: Text; seen: number }>(); // transient labels (cycles, squadrons, reasons)
  const packets: Sprite[] = [];
  const fxs: Fx[] = [];
  let lastWriteAt = 0;
  let frame = 0;

  let PF: typeof import("pixi-filters") | null = null;
  const shocks: { f: Filter & { time: number }; t: number }[] = [];
  /** ShockwaveFilter ~0.8s at a world point. Disabled: nesting it over the bloom pass clipped the world in Pixi 8.21,
   *  so resolves / memory writes use additive ring sprites (spawnFx) instead. Flip SHOCKWAVE to retry. */
  const SHOCKWAVE = false;
  function shock(wx: number, wy: number) {
    if (!SHOCKWAVE || !PF || shocks.length >= 3) return;
    try {
      const p = cam.toScreen(wx, wy);
      const f = new PF.ShockwaveFilter({ center: { x: p.x, y: p.y }, amplitude: 14, wavelength: 90, speed: 520, brightness: 1.15, radius: 480 } as any) as unknown as Filter & { time: number };
      shocks.push({ f, t: 0 }); root.filters = shocks.map((x) => x.f);
    } catch { PF = null; }
  }
  let bloom: Filter | null = null, glowSel: Filter | null = null, glowGold: Filter | null = null, glowGem: Filter | null = null;
  import("pixi-filters").then((pf) => {
    try {
      PF = pf;
      bloom = new pf.AdvancedBloomFilter({ threshold: 0.6, bloomScale: 0.55, brightness: 1.0, blur: 5, quality: 4 });
      glowSel = new pf.GlowFilter({ distance: 12, outerStrength: 2.2, innerStrength: 0, color: 0xc8f4ff, quality: 0.2 });
      glowGold = new pf.GlowFilter({ distance: 10, outerStrength: 1.6, innerStrength: 0, color: GOLD, quality: 0.2 });
      glowGem = new pf.GlowFilter({ distance: 14, outerStrength: 2, innerStrength: 0.2, color: 0x9fffef, quality: 0.2 });
      world.filters = [bloom];
    } catch (e) { console.warn("[scene] pixi-filters unavailable, using additive sprites only", e); }
  }).catch(() => {});

  function build() {
    // background (screen space, parallax)
    nebula = new TilingSprite({ texture: tex.nebula, width: app.screen.width, height: app.screen.height }); nebula.alpha = 0.55; nebula.tint = 0x8fa0c8;
    stars1 = new TilingSprite({ texture: tex.starfield, width: app.screen.width, height: app.screen.height }); stars1.blendMode = "add"; stars1.alpha = 0.7;
    stars2 = new TilingSprite({ texture: tex.starfield, width: app.screen.width, height: app.screen.height }); stars2.blendMode = "add"; stars2.alpha = 0.45; stars2.tileScale.set(0.55);
    bg.addChild(nebula, stars1, stars2);

    // sun
    sun.halo = sprite("circle_05", { tint: 0xff9a3c, add: true, size: SUN_R * 7, alpha: 0.35 });
    sun.l1 = sprite("light_03", { tint: 0xffd27a, add: true, size: SUN_R * 4.2, alpha: 0.55 });
    sun.l2 = sprite("light_01", { tint: 0xffb347, add: true, size: SUN_R * 3.4, alpha: 0.5 });
    sun.core = sprite("sphere1", { tint: 0xffb444, size: SUN_R * 2 });
    sun.ring = sprite("circle_02", { tint: 0xffd27a, add: true, size: SUN_R * 2.4, alpha: 0 });
    sun.flash = 0;
    L.sun.addChild(sun.halo, sun.l1, sun.l2, sun.core, sun.ring);

    // research station (River Sentinel)
    research.glow = sprite("circle_05", { tint: 0x40e0d0, add: true, size: 150, alpha: 0.3 });
    research.gem = sprite("meteor_squareLarge", { tint: 0x9fffef, size: 46 });
    research.shards = [0, 1, 2].map(() => sprite("meteor_small", { tint: 0x7fe9ff, size: 14 }));
    research.twinkle = sprite("star_08", { tint: 0xd8fffa, add: true, size: 70, alpha: 0.6 });
    research.name = label("RESEARCH", 13, 0x9fffef);
    L.research.addChild(research.glow, research.gem, ...research.shards, research.twinkle);
    L.labels.addChild(research.name);

    // fog + frontier smoke
    fog = new Sprite(fogTexture(0.3)); fog.anchor.set(0.5);
    L.fog.addChild(fog);
    for (let i = 0; i < 14; i++) { const s = sprite("smoke_04", { tint: 0x33405e, alpha: 0.22 }); smoke.push(s); L.fog.addChild(s); }

    for (let i = 0; i < 64; i++) { const p = sprite("star_04", { tint: 0xffe2a0, add: true, size: 26, alpha: 0 }); packets.push(p); L.packets.addChild(p); }
    L.packets.blendMode = "add";
    built = true;
  }

  function buildBelt(r: number) {
    L.belt.removeChildren();
    for (let i = 0; i < 240; i++) {
      const a = Math.random() * Math.PI * 2, rr = r + (Math.random() - 0.5) * 70 + (Math.random() - 0.5) * 30;
      const s = sprite(Math.random() < 0.5 ? "meteor_small" : "meteor_detailedSmall", { tint: 0x4a5163, size: 4 + Math.random() * 9, alpha: 0.5 + Math.random() * 0.5 });
      s.position.set(Math.cos(a) * rr, Math.sin(a) * rr); s.rotation = Math.random() * 6;
      L.belt.addChild(s);
    }
  }
  let beltR = -1;

  function planetView(p: Planet): PlanetView {
    let v = planetViews.get(p.id);
    if (v) return v;
    const c = new Container();
    const base = sprite("planet04", { size: PLANET_R * 2 });
    const dept = sprite(PLANET_TEX[p.id] ?? "planet07", { size: PLANET_R * 2 });
    const ring = new Graphics();
    const lights = Array.from({ length: 7 }, () => sprite("star_04", { tint: 0xffd27a, add: true, size: 16 }));
    const dish = sprite("satellite_A", { tint: 0xcfe6ff, size: 26 });
    c.addChild(ring, base, dept, ...lights, dish);
    const name = label(p.name.toUpperCase(), 18, hex(p.color));
    const cycle = label("", 12, 0x8fa3b8, "IBM Plex Sans", "500");
    L.planets.addChild(c); L.labels.addChild(name, cycle);
    v = { c, base, dept, lights, ring, dish, name, cycle };
    planetViews.set(p.id, v);
    return v;
  }

  function enemyView(e: Enemy): EnemyView {
    let v = enemyViews.get(e.id);
    if (v && v.kind === e.kind) return v;
    if (v) { v.c.destroy({ children: true }); v.title.destroy(); }
    const c = new Container();
    const aura = sprite("circle_05", { add: true, alpha: 0.5 });
    const halo = sprite("magic_02", { tint: GOLD, add: true, alpha: 0.7 });
    const hullTex: TexName = e.kind === "credential" ? "ship_sidesB" : e.kind === "account" ? "station_C" : e.kind === "approval" ? "meteor_squareLarge"
      : e.kind === "missing_info" ? "spaceStation_028" : e.kind === "dependency" ? "ship_E" : e.kind === "failure" ? "enemy_A" : "enemy_D";
    const hull = sprite(hullTex);
    if (e.kind === "credential") hull.rotation = Math.PI;
    const smokeS = sprite("smoke_04", { tint: 0x6b6f7a, alpha: 0.35 });
    const drones: Sprite[] = [];
    const badge = label("!", 22, GOLD, "Rajdhani", "700");
    c.addChild(aura, smokeS, halo, hull, badge);
    L.enemies.addChild(c);
    const title = label("", 13, 0xffffff, "Rajdhani", "700"); L.labels.addChild(title);
    v = { c, title, aura, hull, halo, badge, drones, smoke: smokeS, x: e.pos.x, y: e.pos.y, seen: 0, kind: e.kind, last: e, born: frame > 30 ? time : -10 };
    if (frame > 30) spawnFx("circle_02", e.pos.x, e.pos.y, QUAD_COLOR[e.quadrant] ?? 0xff4d4d, 300, 30, 0.6, 0.8); // warp-in
    enemyViews.set(e.id, v);
    return v;
  }

  function unitView(u: Unit): UnitView {
    const texName: TexName = u.role === "sentinel" ? "meteor_squareLarge" : u.role === "subagent" ? "ship_sidesC" : TIER_TEX[u.tier] ?? "ship_B";
    let v = unitViews.get(u.id);
    if (v) { if (v.texName !== texName) { v.ship.texture = tex[texName]; v.texName = texName; } return v; }
    const glow = sprite("circle_05", { alpha: 0.35 });
    const trail = sprite("star_04", { alpha: 0 });
    const ship = sprite(texName);
    L.unitGlow.addChild(glow, trail); L.units.addChild(ship);
    if (frame > 30) spawnFx("star_08", u.pos.x, u.pos.y, 0xe8f6ff, 20, 160, 0.5, 1); // warp-in flash
    v = { glow, trail, ship, x: u.pos.x, y: u.pos.y, rot: 0, texName, seen: 0 };
    unitViews.set(u.id, v);
    return v;
  }

  function tmpText(key: string, text: string, size: number, color: number, font = "Rajdhani"): Text {
    let e = texts.get(key);
    if (!e) { e = { t: label(text, size, color, font, font === "Rajdhani" ? "700" : "500"), seen: frame }; L.labels.addChild(e.t); texts.set(key, e); }
    if (e.t.text !== text) e.t.text = text;
    e.seen = frame; e.t.visible = true;
    return e.t;
  }

  function spawnFx(name: TexName, x: number, y: number, tint: number, from: number, to: number, dur: number, alpha = 0.9) {
    const s = sprite(name, { tint, add: true }); s.position.set(x, y); L.fx.addChild(s);
    setSize(s, from); fxs.push({ s, t: 0, dur, from, to, alpha });
  }

  // ---------- helpers ----------
  const mode = () => store.mode;
  const dimAlpha = (planetId?: string) => { const m = mode(); return m.kind === "planet" && planetId && planetId !== m.planetId ? 0.16 : 1; };
  const projectColor = (s: WorldState, id: string) => hex(s.projects.find((p) => p.id === id)?.color, 0x9fe8ff);
  const unitHidden = (u: Unit) => u.hidden || u.status === "dead" || store.isHidden("unit", u.id, { planetId: u.planetId, projectId: u.projectId });
  const enemyHidden = (e: Enemy) => e.hidden || store.isHidden("enemy", e.id) || (e.planetIds.length > 0 && e.planetIds.every((p) => store.isHidden("planet", p)));
  const unitSize = (u: Unit) => (u.role === "subagent" ? 20 : u.role === "sentinel" ? 34 : 34) * cam.ui;

  // ---------- per-frame ----------
  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000); time += dt; frame++;
    cam.update(Math.min(0.5, ticker.deltaMS / 1000)); // wall-clock so fly-tos finish even when frames are throttled
    top.position.copyFrom(world.position); top.scale.copyFrom(world.scale);
    const s = store.state;
    if (!built || !s) return;
    if (!fitted) { fitted = true; measureInsets(); cam.minScale = cam.fitScale(s.systemRadius * 2.2); cam.scale = cam.fitScale(s.systemRadius * 1.05); cam.update(0); }
    const R = s.systemRadius, ui = cam.ui;

    // background parallax
    for (const t of [nebula, stars1, stars2]) { t.width = app.screen.width; t.height = app.screen.height; }
    nebula.tilePosition.set(-cam.x * cam.scale * 0.03, -cam.y * cam.scale * 0.03);
    stars1.tilePosition.set(-cam.x * cam.scale * 0.08, -cam.y * cam.scale * 0.08);
    stars2.tilePosition.set(-cam.x * cam.scale * 0.16 + time * 2, -cam.y * cam.scale * 0.16);

    // sun
    const pulse = s.sunPulse ?? 0.5;
    const writes = s.knowledge?.recent?.filter((m) => m.kind === "write") ?? [];
    for (const w of writes) if (w.at > lastWriteAt) {
      if (lastWriteAt > 0) {
        sun.flash = 1; spawnFx("circle_02", 0, 0, 0xffd27a, SUN_R * 2, SUN_R * 9, 1.2, 0.8); shock(0, 0);
        const pl = s.planets.find((p) => p.id === w.planetId); if (pl) spawnFx("circle_02", pl.pos.x, pl.pos.y, 0xffe2a0, PLANET_R * 1.5, PLANET_R * 4, 0.9, 0.7);
      }
      lastWriteAt = Math.max(lastWriteAt, w.at);
    }
    if (lastWriteAt === 0) lastWriteAt = 1;
    sun.flash = Math.max(0, sun.flash - dt * 1.4);
    sun.l1.rotation += dt * 0.05; sun.l2.rotation -= dt * 0.08;
    sun.halo.alpha = 0.18 + 0.14 * pulse + 0.4 * sun.flash;
    sun.l1.alpha = 0.28 + 0.2 * pulse + 0.3 * sun.flash; sun.l2.alpha = 0.3 + 0.15 * pulse;
    const rp = (time * 0.45) % 1; setSize(sun.ring, SUN_R * (2.1 + rp * 2.2)); sun.ring.alpha = (1 - rp) * (0.25 + 0.5 * pulse);
    sun.core.tint = sun.flash > 0.05 ? 0xffd890 : 0xffb444;
    L.sun.alpha = mode().kind === "planet" ? 0.7 : 1;

    // orbits + cycle markers
    const g = L.orbits; g.clear();
    const showOrbits = store.layerOn("orbits");
    for (const p of s.planets) {
      const hidden = p.hidden || store.isHidden("planet", p.id);
      const v = planetView(p);
      v.c.visible = !hidden; v.name.visible = !hidden && store.layerOn("labels"); v.cycle.visible = false;
      if (hidden) continue;
      const col = hex(p.color), da = dimAlpha(p.id);
      if (showOrbits) {
        g.circle(0, 0, p.orbitRadius).stroke({ width: 1.2 * ui, color: col, alpha: 0.16 * da });
        const span = p.cycle.endAt - p.cycle.startAt;
        const unit = span <= 2 * 86_400_000 ? 3_600_000 : 86_400_000;
        const n = Math.min(90, Math.round(span / unit));
        for (let k = 1; k < n; k++) {
          const a = p.baseAngle + (2 * Math.PI * k) / n, r0 = p.orbitRadius - 5 * ui, r1 = p.orbitRadius + 5 * ui;
          g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        }
        g.stroke({ width: 1 * ui, color: col, alpha: 0.3 * da });
        // progress arc (traversed part of the cycle)
        arc(g, 0, 0, p.orbitRadius, p.baseAngle, p.baseAngle + 2 * Math.PI * Math.max(0, Math.min(1, p.progress)));
        g.stroke({ width: 2.2 * ui, color: col, alpha: 0.32 * da });
        // cycle-end marker
        const a = p.baseAngle, m0 = p.orbitRadius - 16 * ui, m1 = p.orbitRadius + 16 * ui;
        g.moveTo(Math.cos(a) * m0, Math.sin(a) * m0).lineTo(Math.cos(a) * m1, Math.sin(a) * m1).stroke({ width: 3 * ui, color: 0xffffff, alpha: 0.75 * da });
        g.circle(Math.cos(a) * p.orbitRadius, Math.sin(a) * p.orbitRadius, 4 * ui).fill({ color: col, alpha: da });
        if (store.layerOn("labels")) {
          v.cycle.visible = true; v.cycle.text = p.cycle.label; v.cycle.scale.set(ui);
          v.cycle.position.set(Math.cos(a) * (p.orbitRadius + 34 * ui), Math.sin(a) * (p.orbitRadius + 34 * ui)); v.cycle.alpha = 0.85 * da;
        }
      }

      // planet body
      v.c.position.set(p.pos.x, p.pos.y); v.c.alpha = da;
      const stage = p.colonization ?? 0;
      v.dept.alpha = stage / 3; v.base.alpha = 1 - (stage / 3) * 0.6;
      v.dept.rotation += dt * 0.02; v.base.rotation = v.dept.rotation;
      const away = Math.atan2(p.pos.y, p.pos.x); // night side faces away from the sun
      v.lights.forEach((l, i) => {
        l.visible = stage >= 2;
        const aa = away + (hash(p.id + i) - 0.5) * 2.2, rr = PLANET_R * (0.35 + 0.5 * hash(i + p.id));
        l.position.set(Math.cos(aa) * rr, Math.sin(aa) * rr); l.alpha = 0.5 + 0.4 * Math.sin(time * 2 + i * 1.7);
      });
      v.ring.clear();
      if (stage >= 3) {
        v.ring.ellipse(0, 0, PLANET_R * 1.55, PLANET_R * 0.42).stroke({ width: 3, color: col, alpha: 0.55 });
        v.ring.rotation = -0.35;
      }
      v.ring.circle(0, 0, PLANET_R * 1.12).stroke({ width: 1.2 * ui, color: col, alpha: 0.25 });
      const sunDir = away + Math.PI;
      v.dish.position.set(Math.cos(sunDir) * PLANET_R * 1.15, Math.sin(sunDir) * PLANET_R * 1.15); v.dish.rotation = sunDir + Math.PI / 2;
      v.dish.visible = stage >= 1;
      v.name.position.set(p.pos.x, p.pos.y + PLANET_R + 20 * ui); v.name.scale.set(ui); v.name.alpha = da;
    }

    // asteroid belt + mines
    const mines = (s.mines ?? []).filter((m) => !m.hidden && !store.isHidden("mine", m.id));
    const bR = s.mines.length ? s.mines.reduce((a, m) => a + Math.hypot(m.pos.x, m.pos.y), 0) / s.mines.length : R * 0.27;
    if (Math.abs(bR - beltR) > 5) { beltR = bR; buildBelt(bR); }
    L.belt.rotation += dt * 0.004;
    L.mines.visible = store.layerOn("mines");
    const seenMine = new Set<string>();
    mines.forEach((m, mi) => {
      seenMine.add(m.id);
      let v = mineViews.get(m.id);
      if (!v) {
        v = { glow: sprite("circle_05", { add: true, alpha: 0.35, size: 110 }), s: sprite("meteor_squareDetailedLarge"), name: label("", 12, 0xdbe8f5), val: label("", 12, 0xffffff, "JetBrains Mono", "500") };
        L.mines.addChild(v.glow, v.s); L.labels.addChild(v.name, v.val); mineViews.set(m.id, v);
      }
      const frac = m.total > 0 ? Math.max(0, Math.min(1, m.remaining / m.total)) : 0;
      const col = hex(m.color);
      v.s.tint = col; setSize(v.s, 26 + 34 * frac); v.s.rotation += dt * 0.1; v.s.position.set(m.pos.x, m.pos.y);
      v.glow.tint = col; v.glow.position.set(m.pos.x, m.pos.y); v.glow.alpha = 0.2 + 0.25 * frac;
      const lv = store.layerOn("mines") && store.layerOn("labels");
      v.name.visible = v.val.visible = lv;
      const up = mi % 2 === 1 ? -1 : 1, ly = m.pos.y + up * 34 * ui + (up < 0 ? -16 * ui : 0);
      v.name.text = m.label.toUpperCase(); v.name.scale.set(ui * 0.85); v.name.position.set(m.pos.x, ly);
      const val = `$${m.remaining.toFixed(m.remaining < 100 ? 1 : 0)}/${m.total}`; if (v.val.text !== val) v.val.text = val;
      v.val.scale.set(ui * 0.8); v.val.position.set(m.pos.x, ly + 14 * ui);
      v.val.tint = frac < 0.2 ? 0xff4d4d : 0xffffff;
    });
    for (const [id, v] of mineViews) if (!seenMine.has(id)) { v.s.destroy(); v.glow.destroy(); v.name.destroy(); v.val.destroy(); mineViews.delete(id); }

    // research station
    L.research.visible = store.layerOn("research");
    research.name.visible = L.research.visible && store.layerOn("labels");
    const rpos = s.research?.pos ?? { x: 0, y: -200 };
    const running = s.research?.runs?.some((r) => r.status === "running") ?? false;
    L.research.position.set(rpos.x, rpos.y);
    research.gem.rotation += dt * 0.25;
    research.shards.forEach((sh, i) => { const a = -time * 0.6 + (i * Math.PI * 2) / 3; sh.position.set(Math.cos(a) * 36, Math.sin(a) * 36); sh.rotation -= dt; });
    research.twinkle.alpha = 0.35 + 0.35 * Math.max(0, Math.sin(time * 3.1)); research.twinkle.rotation += dt * 0.4;
    research.glow.alpha = running ? 0.45 + 0.3 * Math.sin(time * 5) : 0.22;
    research.gem.filters = running && glowGem ? [glowGem] : null;
    research.name.position.set(rpos.x, rpos.y + 44 * ui); research.name.scale.set(ui);

    // factories
    L.factories.visible = store.layerOn("factories");
    const seenF = new Set<string>();
    const ov = L.overlay; ov.clear();
    for (const f of s.factories ?? []) {
      if (f.hidden || store.isHidden("factory", f.id, { planetId: f.planetId })) continue;
      seenF.add(f.id);
      let v = factoryViews.get(f.id);
      if (!v) { v = { s: sprite("spaceStation_018", { tint: 0xcfe6ff }), name: label("", 11, 0xaec3d8, "IBM Plex Sans", "500") }; L.factories.addChild(v.s); L.labels.addChild(v.name); factoryViews.set(f.id, v); }
      setSize(v.s, 34 * ui); v.s.position.set(f.pos.x, f.pos.y); v.s.rotation += dt * 0.08;
      const da = dimAlpha(f.planetId);
      v.s.alpha = (f.paused ? 0.35 : 1) * da;
      v.name.text = f.label + (f.paused ? " · paused" : ""); v.name.scale.set(ui); v.name.position.set(f.pos.x, f.pos.y - 32 * ui);
      v.name.visible = L.factories.visible && store.layerOn("labels"); v.name.alpha = da;
      if (L.factories.visible) {
        const frac = Math.max(0, Math.min(1, 1 - (f.nextRunAt - s.now) / Math.max(1, f.cadenceMs)));
        ov.circle(f.pos.x, f.pos.y, 22 * ui).stroke({ width: 1.5 * ui, color: 0x9fb3c8, alpha: 0.25 * da });
        arc(ov, f.pos.x, f.pos.y, 22 * ui, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * frac);
        ov.stroke({ width: 2.5 * ui, color: f.paused ? 0x8a8f98 : 0x5cf2b0, alpha: 0.85 * da });
      }
    }
    for (const [id, v] of factoryViews) if (!seenF.has(id)) { v.s.destroy(); v.name.destroy(); factoryViews.delete(id); }

    // energy beams sun → colony + packets
    const bm = L.beams; bm.clear();
    let pk = 0;
    if (store.layerOn("beams")) for (const p of s.planets) {
      if (p.hidden || store.isHidden("planet", p.id) || (p.colonization ?? 0) < 1) continue;
      const d = Math.hypot(p.pos.x, p.pos.y) || 1, ux = p.pos.x / d, uy = p.pos.y / d;
      const x0 = ux * SUN_R * 1.05, y0 = uy * SUN_R * 1.05, x1 = p.pos.x - ux * PLANET_R * 1.2, y1 = p.pos.y - uy * PLANET_R * 1.2;
      const k = (0.25 + 0.75 * (p.memTraffic ?? 0)) * dimAlpha(p.id), col = 0xffd27a;
      bm.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 10 * ui, color: col, alpha: 0.08 * k });
      bm.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 4 * ui, color: col, alpha: 0.25 * k });
      bm.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1.5 * ui, color: 0xfff3d6, alpha: 0.9 * k });
      const n = 1 + Math.round(4 * (p.memTraffic ?? 0));
      for (let i = 0; i < n && pk < packets.length; i++, pk++) {
        const t = (time * (0.18 + 0.25 * (p.memTraffic ?? 0)) + i / n + hash(p.id)) % 1;
        const q = packets[pk]; q.position.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); q.alpha = Math.sin(Math.PI * t) * k; setSize(q, 22 * ui); q.rotation = time;
      }
    }
    for (let i = pk; i < packets.length; i++) packets[i].alpha = 0;

    // units
    const showUnits = store.layerOn("units");
    const visUnits: Unit[] = [];
    const disp = new Map<string, { x: number; y: number }>();
    const lerpK = 1 - Math.exp(-dt * 6);
    const sel0 = new Set(store.selection);
    for (const u of s.units) {
      if (!showUnits || unitHidden(u)) continue;
      visUnits.push(u);
      const v = unitView(u); v.seen = frame;
      v.x += (u.pos.x - v.x) * lerpK; v.y += (u.pos.y - v.y) * lerpK;
      if (Math.hypot(u.pos.x - v.x, u.pos.y - v.y) > 800) { v.x = u.pos.x; v.y = u.pos.y; }
      disp.set(u.id, { x: v.x, y: v.y });
      const col = projectColor(s, u.projectId);
      const size = unitSize(u);
      const en = u.attacking ? s.enemies.find((e) => e.id === u.attacking) : undefined;
      const tgt = en ? en.pos : u.target;
      const want = Math.atan2(tgt.y - v.y, tgt.x - v.x) + Math.PI / 2;
      let dr = want - v.rot; while (dr > Math.PI) dr -= 2 * Math.PI; while (dr < -Math.PI) dr += 2 * Math.PI;
      v.rot += dr * lerpK;
      v.ship.texture = tex[v.texName]; setSize(v.ship, size); v.ship.position.set(v.x, v.y); v.ship.rotation = u.role === "sentinel" ? time * 0.4 : v.rot;
      v.ship.tint = u.role === "sentinel" ? 0x9fffef : u.status === "done" ? 0x8a8f98 : col;
      const da = dimAlpha(u.planetId);
      v.ship.alpha = (u.status === "idle" || u.status === "done" ? 0.55 : 1) * da;
      v.glow.tint = u.status === "blocked" ? 0xff4d4d : col; setSize(v.glow, size * 2.4); v.glow.position.set(v.x, v.y);
      v.glow.alpha = (u.status === "acting" ? 0.3 + 0.25 * Math.sin(time * 12) : 0.3) * da;
      const moving = u.status === "working" || u.status === "acting" || u.status === "attacking";
      const back = v.rot + Math.PI / 2; // ships face up; exhaust sits behind the nose
      v.trail.visible = moving && u.role !== "sentinel";
      if (v.trail.visible) { v.trail.tint = col; setSize(v.trail, size * (0.9 + 0.25 * Math.sin(time * 30 + hash(u.id) * 9))); v.trail.position.set(v.x + Math.cos(back) * size * 0.55, v.y + Math.sin(back) * size * 0.55); v.trail.alpha = 0.55 * da; }
      const focused = store.focus?.kind === "unit" && store.focus.id === u.id;
      v.ship.filters = focused && glowSel ? [glowSel] : null;
      if (store.layerOn("labels") && (cam.scale > 0.55 || focused || sel0.has(u.id)) && u.role !== "subagent") {
        const t = tmpText(`unit:${u.id}`, u.label, 12, col, "IBM Plex Sans"); t.position.set(v.x, v.y + size * 0.85); t.scale.set(ui * 0.9); t.alpha = da;
      }
    }
    for (const [id, v] of unitViews) if (v.seen !== frame) { v.ship.destroy(); v.glow.destroy(); v.trail.destroy(); unitViews.delete(id); }

    // enemies
    const showEnemies = store.layerOn("enemies");
    const enemyPos = new Map<string, { x: number; y: number; r: number }>();
    for (const e of s.enemies) {
      if (!showEnemies || enemyHidden(e)) continue;
      const v = enemyView(e); v.seen = frame; v.last = e;
      v.x += (e.pos.x - v.x) * lerpK; v.y += (e.pos.y - v.y) * lerpK;
      const qc = QUAD_COLOR[e.quadrant] ?? 0xff4d4d;
      const age = time - v.born, grow = age >= 0.6 ? 1 : 1 - Math.pow(1 - age / 0.6, 3) * Math.cos(age * 9);
      const size = (46 + 14 * Math.min(8, e.strength)) * ui * Math.max(0.05, grow);
      enemyPos.set(e.id, { x: v.x, y: v.y, r: size * 0.6 });
      const drift = e.quadrant === "drop" ? Math.sin(time * 0.5 + hash(e.id) * 6) * 12 : 0;
      v.c.position.set(v.x + drift, v.y + drift * 0.5);
      const speed = e.quadrant === "do_now" ? 6 : e.quadrant === "schedule" ? 1.6 : 2.5;
      const pa = 0.5 + 0.5 * Math.sin(time * speed + hash(e.id) * 6);
      v.aura.tint = qc; setSize(v.aura, size * (2.4 + 0.3 * pa)); v.aura.alpha = (0.35 + 0.35 * pa) * (e.resolved ? 0.3 : 1);
      v.hull.tint = e.humanOnly ? 0xffe28a : qc; setSize(v.hull, size);
      if (e.kind === "credential") v.hull.rotation = Math.PI;
      else if (e.kind === "missing_info") v.hull.rotation += dt * 0.3;
      else if (e.kind === "approval") v.hull.rotation = Math.PI / 4 + Math.sin(time) * 0.1;
      v.hull.filters = e.humanOnly && glowGold ? [glowGold] : null;
      v.halo.visible = e.humanOnly; setSize(v.halo, size * 1.9); v.halo.rotation += dt * 0.6;
      v.badge.visible = e.humanOnly; v.badge.position.set(size * 0.55, -size * 0.55); v.badge.scale.set(ui);
      v.smoke.visible = e.kind === "missing_info"; setSize(v.smoke, size * 1.4); v.smoke.rotation -= dt * 0.2; v.smoke.alpha = 0.25 + 0.1 * Math.sin(time);
      // drone swarm for rate_limit / billing: N = strength
      const nd = e.kind === "rate_limit" || e.kind === "billing" ? Math.max(1, Math.min(12, Math.round(e.strength) + 2)) : 0;
      while (v.drones.length < nd) { const d = sprite("enemy_D"); v.drones.push(d); v.c.addChild(d); }
      while (v.drones.length > nd) v.drones.pop()!.destroy();
      v.drones.forEach((d, i) => { const a = time * 1.3 + (i * Math.PI * 2) / nd, rr = size * (0.9 + 0.15 * Math.sin(time * 2 + i)); d.position.set(Math.cos(a) * rr, Math.sin(a) * rr); d.rotation = a + Math.PI; d.tint = qc; setSize(d, size * 0.32); });
      if (nd) v.hull.alpha = 0.9;
      v.c.alpha = Math.max(...(e.planetIds.length ? e.planetIds.map((p) => dimAlpha(p)) : [1]));
      if (e.resolved) v.c.alpha *= 0.4;
      const tt = `${e.title.toUpperCase()}${e.strength > 1 ? `  ×${Math.round(e.strength)}` : ""}`;
      if (v.title.text !== tt) v.title.text = tt;
      v.title.tint = e.humanOnly ? GOLD : qc; v.title.alpha = v.c.alpha;
      v.title.visible = store.layerOn("labels"); v.title.scale.set(ui); v.title.position.set(v.c.x, v.c.y + size * 0.95 + 8 * ui);
    }
    for (const [id, v] of enemyViews) if (v.seen !== frame) {
      const stillThere = s.enemies.some((e) => e.id === id);
      if (!stillThere || v.last.resolved) { shock(v.x, v.y); spawnFx("circle_02", v.x, v.y, 0xffffff, 40, 520, 0.8, 1); spawnFx("light_01", v.x, v.y, QUAD_COLOR[v.last.quadrant] ?? 0xffffff, 60, 260, 0.6, 0.9); }
      v.c.destroy({ children: true }); v.title.destroy(); enemyViews.delete(id);
    }

    // lanes + mining paths
    const pg = L.paths; pg.clear();
    const claude = mines.find((m) => m.id === "claude");
    const showPaths = store.layerOn("paths");
    if (showPaths) {
      const solidByColor = new Map<number, Unit[]>();
      for (const u of visUnits) { if (u.status === "done") continue; const c = projectColor(s, u.projectId); (solidByColor.get(c) ?? solidByColor.set(c, []).get(c)!).push(u); }
      for (const [col, us] of solidByColor) {
        for (const u of us) if (u.charted) pg.moveTo(u.home.x, u.home.y).lineTo(u.target.x, u.target.y);
        pg.stroke({ width: 1.2 * ui, color: col, alpha: 0.2 });
        for (const u of us) if (!u.charted) dashed(pg, u.home.x, u.home.y, u.target.x, u.target.y, 6 * ui, 10 * ui);
        pg.stroke({ width: 1.2 * ui, color: col, alpha: 0.14 });
        for (const u of us) { // target marker; frontier targets fade into fog
          const fa = u.charted ? 0.5 : 0.25;
          pg.moveTo(u.target.x - 5 * ui, u.target.y).lineTo(u.target.x + 5 * ui, u.target.y).moveTo(u.target.x, u.target.y - 5 * ui).lineTo(u.target.x, u.target.y + 5 * ui).stroke({ width: 1.2 * ui, color: col, alpha: fa });
        }
      }
      if (claude) {
        let n = 0;
        for (const u of visUnits) {
          if (n > 80) break;
          if (u.status !== "working" && u.status !== "acting" && u.status !== "attacking") continue;
          const p = disp.get(u.id)!; n++;
          dashed(pg, p.x, p.y, claude.pos.x, claude.pos.y, 2.5 * ui, 16 * ui, -time * 40 * ui);
        }
        pg.stroke({ width: 2.2 * ui, color: hex(claude.color), alpha: 0.28 });
      }
    }

    // tethers
    const tg = L.tethers; tg.clear();
    const hov = store.hover;
    for (const k of texts.keys()) if (k.startsWith("reason:")) texts.get(k)!.t.visible = false;
    if (store.layerOn("tethers")) {
      // subagent → parent
      for (const u of visUnits) {
        if (!u.parentId) continue;
        const a = disp.get(u.id), b = disp.get(u.parentId); if (!a || !b) continue;
        dashed(tg, a.x, a.y, b.x, b.y, 5 * ui, 6 * ui);
        tg.stroke({ width: 1 * ui, color: projectColor(s, u.projectId), alpha: 0.45 * dimAlpha(u.planetId) });
      }
      // blocked unit → enemy
      for (const e of s.enemies) {
        const ep = enemyPos.get(e.id); if (!ep) continue;
        const qc = e.humanOnly ? GOLD : QUAD_COLOR[e.quadrant] ?? 0xff4d4d;
        const hot = hov?.kind === "enemy" && hov.id === e.id;
        for (const id of e.blocked) {
          const a = disp.get(id); if (!a) continue;
          dashed(tg, a.x, a.y, ep.x, ep.y, 10 * ui, 6 * ui, -time * 20 * ui);
          if (hot || (hov?.kind === "unit" && hov.id === id)) {
            const t = tmpText(`reason:${e.id}:${id}`, e.reason, 13, qc, "IBM Plex Sans");
            t.position.set((a.x + ep.x) / 2, (a.y + ep.y) / 2 - 10 * ui); t.scale.set(ui);
          }
        }
        tg.stroke({ width: (hot ? 2.4 : 1.4) * ui, color: qc, alpha: hot ? 0.9 : 0.5 });
        if (e.kind === "dependency" && e.dependsOnUnit) {
          const d = disp.get(e.dependsOnUnit);
          if (d) { dashed(tg, ep.x, ep.y, d.x, d.y, 3 * ui, 7 * ui); tg.stroke({ width: 1.4 * ui, color: 0xa774ff, alpha: 0.7 }); }
        }
        // attackers: laser bolts + sparks
        for (const id of e.attackers) {
          const a = disp.get(id); if (!a) continue;
          const dx = ep.x - a.x, dy = ep.y - a.y;
          for (let b = 0; b < 2; b++) {
            const t = (time * 2.2 + hash(id) + b * 0.5) % 1, t2 = Math.min(1, t + 0.08);
            tg.moveTo(a.x + dx * t, a.y + dy * t).lineTo(a.x + dx * t2, a.y + dy * t2);
          }
          tg.stroke({ width: 2.5 * ui, color: 0xaff6ff, alpha: 0.95 });
          const sp = 0.5 + 0.5 * Math.sin(time * 20 + hash(id) * 10);
          tg.circle(ep.x - dx * 0.02, ep.y - dy * 0.02, 5 * ui * sp).fill({ color: 0xffffff, alpha: 0.8 * sp });
          tg.circle(a.x + dx * 0.03, a.y + dy * 0.03, 3 * ui).fill({ color: 0xaff6ff, alpha: 0.6 + 0.4 * sp });
        }
      }
    }

    // unit overlay: hp ring, status marks, selection
    const sel = new Set(store.selection);
    for (const u of visUnits) {
      const p = disp.get(u.id)!; const r = unitSize(u) * 0.75; const da = dimAlpha(u.planetId);
      if (u.role !== "subagent" || sel.has(u.id)) {
        const hp = Math.max(0, Math.min(1, u.hp));
        arc(ov, p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * hp);
        ov.stroke({ width: 1.6 * ui, color: hp > 0.5 ? 0x5cf2b0 : hp > 0.25 ? 0xffb020 : 0xff4d4d, alpha: 0.6 * da });
      }
      if (u.status === "blocked") ov.circle(p.x, p.y, r * 1.35).stroke({ width: 1.6 * ui, color: 0xff4d4d, alpha: (0.5 + 0.4 * Math.sin(time * 6)) * da });
      if (u.status === "acting" && Math.sin(time * 10 + hash(u.id) * 6) > 0) ov.circle(p.x + r * 0.9, p.y - r * 0.9, 2.5 * ui).fill({ color: 0xffffff, alpha: 0.9 * da });
      if (sel.has(u.id)) {
        ov.circle(p.x, p.y, r * 1.6).stroke({ width: 1.8 * ui, color: 0x7dffb2, alpha: 0.9 });
      }
      if (u.veteran) ov.circle(p.x - r, p.y - r, 2 * ui).fill({ color: GOLD, alpha: 0.9 * da });
    }

    // squadrons (>12 units within ~120px)
    if (visUnits.length > 12) {
      const cell = 120 / cam.scale, buckets = new Map<string, { n: number; x: number; y: number }>();
      for (const u of visUnits) {
        const p = disp.get(u.id)!; const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
        const b = buckets.get(key) ?? { n: 0, x: 0, y: 0 }; b.n++; b.x += p.x; b.y += p.y; buckets.set(key, b);
      }
      for (const [key, b] of buckets) {
        if (b.n <= 12) continue;
        const cx = b.x / b.n, cy = b.y / b.n;
        ov.roundRect(cx - 26 * ui, cy - 46 * ui, 52 * ui, 22 * ui, 4 * ui).fill({ color: 0x0b1424, alpha: 0.85 }).stroke({ width: 1.2 * ui, color: HOLO, alpha: 0.8 });
        const t = tmpText(`squad:${key}`, `×${b.n}`, 15, HOLO, "JetBrains Mono"); t.position.set(cx, cy - 35 * ui); t.scale.set(ui);
      }
    }

    // active view: highlights + pings
    const view = (s.views ?? []).find((v) => v.id === s.activeViewId);
    if (view) {
      const where = (id: string): { x: number; y: number; r: number } | null => {
        const u = disp.get(id); if (u) return { ...u, r: 30 * ui };
        const e = enemyPos.get(id); if (e) return e;
        const p = s.planets.find((q) => q.id === id); if (p) return { ...p.pos, r: PLANET_R * 1.3 };
        const f = s.factories.find((q) => q.id === id); if (f) return { ...f.pos, r: 30 * ui };
        const m = s.mines.find((q) => q.id === id); if (m) return { ...m.pos, r: 40 * ui };
        return null;
      };
      for (const id of view.highlight) {
        const w = where(id); if (!w) continue;
        ov.circle(w.x, w.y, w.r * 1.3).stroke({ width: 2.4 * ui, color: 0xe8f6ff, alpha: 0.6 + 0.3 * Math.sin(time * 4) });
      }
      for (const id of view.pings) {
        const w = where(id); if (!w) continue;
        for (let k = 0; k < 3; k++) { const t = (time * 0.8 + k / 3) % 1; ov.circle(w.x, w.y, w.r * (1 + t * 3)).stroke({ width: 2 * ui, color: 0x9fe8ff, alpha: (1 - t) * 0.8 }); }
      }
    }
    // hover ring
    if (hov) {
      const w = hov.kind === "unit" ? (() => { const d = disp.get(hov.id); const u = d && s.units.find((q) => q.id === hov.id); return d && u ? { ...d, r: unitSize(u) * 0.75 } : undefined; })()
        : hov.kind === "enemy" ? enemyPos.get(hov.id)
        : hov.kind === "planet" ? (() => { const p = s.planets.find((q) => q.id === hov.id); return p ? { ...p.pos, r: PLANET_R * 1.1 } : undefined; })()
        : hov.kind === "sun" ? { x: 0, y: 0, r: SUN_R * 1.1 } : undefined;
      if (w) ov.circle(w.x, w.y, w.r * 1.25 + 4 * ui).stroke({ width: 1.2 * ui, color: 0xe8f6ff, alpha: 0.55 });
    }
    // focus ring for non-unit focus
    const fo = store.focus;
    if (fo && fo.kind !== "unit") {
      const w = fo.kind === "enemy" ? enemyPos.get(fo.id) : fo.kind === "planet" ? (() => { const p = s.planets.find((q) => q.id === fo.id); return p ? { ...p.pos, r: PLANET_R * 1.25 } : undefined; })() : undefined;
      if (w) { const r = w.r * 1.2; for (let k = 0; k < 4; k++) arc(ov, w.x, w.y, r, time * 0.8 + (k * Math.PI) / 2, time * 0.8 + (k * Math.PI) / 2 + 0.9); ov.stroke({ width: 2 * ui, color: 0xe8f6ff, alpha: 0.85 }); }
    }

    // shockwaves
    if (shocks.length) {
      for (let i = shocks.length - 1; i >= 0; i--) { shocks[i].t += dt; shocks[i].f.time = shocks[i].t; if (shocks[i].t > 0.8) shocks.splice(i, 1); }
      root.filters = shocks.length ? shocks.map((x) => x.f) : null;
    }
    // fx
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i]; f.t += dt / f.dur;
      if (f.t >= 1) { f.s.destroy(); fxs.splice(i, 1); continue; }
      setSize(f.s, f.from + (f.to - f.from) * (1 - Math.pow(1 - f.t, 3))); f.s.alpha = f.alpha * (1 - f.t);
    }

    // fog of war
    L.fog.visible = store.layerOn("fog");
    fog.width = fog.height = R * 2 * 2.5; // inner 0.3 of 2.5R → clear to 0.75R
    smoke.forEach((sm, i) => {
      const a = (i / smoke.length) * Math.PI * 2 + time * 0.01 * (i % 2 ? 1 : -1), rr = R * (0.92 + 0.1 * Math.sin(time * 0.1 + i));
      sm.position.set(Math.cos(a) * rr, Math.sin(a) * rr); setSize(sm, R * 0.6); sm.rotation += dt * 0.02 * (i % 2 ? 1 : -1);
    });

    // gc transient labels
    for (const [k, e] of texts) if (e.seen !== frame) { if (frame - e.seen > 120) { e.t.destroy(); texts.delete(k); } else e.t.visible = false; }
    L.labels.visible = store.layerOn("labels") || true;
    for (const [k, e] of texts) if (k.startsWith("squad:") && !store.layerOn("labels")) e.t.visible = false;
  });

  // ---------- picking ----------
  function pick(sx: number, sy: number): Target | null {
    const s = store.state; if (!s) return null;
    const w = cam.toWorld(sx, sy); const tol = 14 / cam.scale;
    let best: Target | null = null, bestD = Infinity;
    let strict = true; // pass 1: exact hull hits only, so a planet under a docked mothership stays clickable
    const consider = (t: Target, x: number, y: number, r: number) => { const d = Math.hypot(w.x - x, w.y - y); if (d < (strict ? r * 0.55 : Math.max(r, tol)) && d - r * 0.3 < bestD) { bestD = d - r * 0.3; best = t; } };
    const units = () => {
      if (store.layerOn("enemies")) for (const e of s.enemies) { if (enemyHidden(e)) continue; const v = enemyViews.get(e.id); consider({ kind: "enemy", id: e.id }, v?.x ?? e.pos.x, v?.y ?? e.pos.y, (46 + 14 * Math.min(8, e.strength)) * cam.ui * 0.6); }
      if (store.layerOn("units")) for (const u of s.units) { if (unitHidden(u)) continue; const v = unitViews.get(u.id); consider({ kind: "unit", id: u.id }, v?.x ?? u.pos.x, v?.y ?? u.pos.y, unitSize(u) * 0.6); }
    };
    units(); if (best) return best;
    for (const p of s.planets) if (!p.hidden && !store.isHidden("planet", p.id)) consider({ kind: "planet", id: p.id }, p.pos.x, p.pos.y, PLANET_R * 1.8);
    if (best) return best;
    strict = false;
    if (store.layerOn("enemies")) for (const e of s.enemies) { if (enemyHidden(e)) continue; const v = enemyViews.get(e.id); consider({ kind: "enemy", id: e.id }, v?.x ?? e.pos.x, v?.y ?? e.pos.y, (46 + 14 * Math.min(8, e.strength)) * cam.ui * 0.6); }
    if (store.layerOn("units")) for (const u of s.units) { if (unitHidden(u)) continue; const v = unitViews.get(u.id); consider({ kind: "unit", id: u.id }, v?.x ?? u.pos.x, v?.y ?? u.pos.y, unitSize(u) * 0.6); }
    if (best) return best;
    if (store.layerOn("factories")) for (const f of s.factories) if (!f.hidden && !store.isHidden("factory", f.id, { planetId: f.planetId })) consider({ kind: "factory", id: f.id }, f.pos.x, f.pos.y, 22 * cam.ui);
    if (store.layerOn("mines")) for (const m of s.mines) if (!m.hidden && !store.isHidden("mine", m.id)) consider({ kind: "mine", id: m.id }, m.pos.x, m.pos.y, 34);
    if (store.layerOn("research") && s.research) consider({ kind: "research", id: "research" }, s.research.pos.x, s.research.pos.y, 40);
    if (best) return best;
    consider({ kind: "sun", id: "sun" }, 0, 0, SUN_R * 1.1);
    for (const p of s.planets) if (!p.hidden && !store.isHidden("planet", p.id)) consider({ kind: "planet", id: p.id }, p.pos.x, p.pos.y, PLANET_R * 1.1);
    return best;
  }

  function flyToMode() {
    const s = store.state; const m = store.mode;
    measureInsets();
    if (!s) return;
    if (m.kind === "planet") { const p = s.planets.find((q) => q.id === m.planetId); if (p) cam.flyTo(p.pos.x * 0.85, p.pos.y * 0.85, cam.fitScale(520)); }
    else if (m.kind === "system") cam.flyTo(0, 0, cam.fitScale(s.systemRadius * 1.05));
    else if (m.kind === "memory") cam.flyTo(0, 0, cam.fitScale(420));
  }
  store.on("mode", flyToMode);
  (window as any).__scene = { cam, pick, store, shock }; // debug handle

  // ---------- input ----------
  const cv = app.canvas as HTMLCanvasElement;
  cv.style.touchAction = "none";
  let down: { x: number; y: number; box: boolean; moved: boolean; button: number } | null = null;
  let last = { x: 0, y: 0 };
  let hoverKey = "";
  const rel = (e: PointerEvent | WheelEvent | MouseEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  cv.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = rel(e); down = { ...p, box: e.shiftKey, moved: false, button: e.button }; last = p;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    const p = rel(e);
    if (down) {
      if (Math.hypot(p.x - down.x, p.y - down.y) > 4) down.moved = true;
      if (down.box) {
        hud.clear();
        if (down.moved) hud.rect(Math.min(down.x, p.x), Math.min(down.y, p.y), Math.abs(p.x - down.x), Math.abs(p.y - down.y)).fill({ color: 0x7dffb2, alpha: 0.06 }).stroke({ width: 1, color: 0x7dffb2, alpha: 0.8 });
      } else if (down.moved) { cam.panBy(p.x - last.x, p.y - last.y); cv.style.cursor = "grabbing"; }
      last = p;
      return;
    }
    const t = pick(p.x, p.y);
    const key = t ? `${t.kind}:${t.id}` : "";
    if (t || key !== hoverKey) store.setHover(t, e.clientX, e.clientY);
    hoverKey = key;
    cv.style.cursor = t ? "pointer" : "default";
  });
  cv.addEventListener("pointerleave", () => { if (hoverKey) { hoverKey = ""; store.setHover(null, 0, 0); } });
  cv.addEventListener("pointerup", (e) => {
    const d = down; down = null; hud.clear(); cv.style.cursor = "default";
    if (!d) return;
    const p = rel(e);
    const s = store.state; if (!s) return;
    if (d.box && d.moved) {
      const a = cam.toWorld(Math.min(d.x, p.x), Math.min(d.y, p.y)), b = cam.toWorld(Math.max(d.x, p.x), Math.max(d.y, p.y));
      const ids = s.units.filter((u) => !unitHidden(u)).filter((u) => { const v = unitViews.get(u.id); const x = v?.x ?? u.pos.x, y = v?.y ?? u.pos.y; return x >= a.x && x <= b.x && y >= a.y && y <= b.y; }).map((u) => u.id);
      store.select(e.shiftKey ? [...new Set([...store.selection, ...ids])] : ids);
      return;
    }
    if (d.moved) return;
    const t = pick(p.x, p.y);
    if (!t) {
      store.select([]); store.setFocus(null);
      if (store.mode.kind !== "system") store.setMode({ kind: "system" });
      return;
    }
    if (t.kind === "unit") { store.select(e.shiftKey ? [...new Set([...store.selection, t.id])] : [t.id]); store.setFocus(t); }
    else if (t.kind === "planet") { store.setFocus(t); store.setMode({ kind: "planet", planetId: t.id }); }
    else if (t.kind === "sun") { store.setFocus(t); store.setMode({ kind: "memory" }); }
    else store.setFocus(t);
  });
  cv.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const p = rel(e); const t = pick(p.x, p.y);
    if (t?.kind === "enemy" && store.selection.length) {
      store.command({ type: "attack", enemyId: t.id, unitIds: store.selection });
      const s = store.state; const en = s?.enemies.find((x) => x.id === t.id);
      if (en) spawnFx("circle_02", en.pos.x, en.pos.y, 0x7dffb2, 30, 180, 0.5, 0.9);
    }
  });
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const p = rel(e); cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
    store.setMode({ kind: "system" });
  });
  /** Keep the system framed between the top bar and the bottom console (HUD chrome is DOM, read its rects). */
  function measureInsets() {
    const r = (sel: string) => { const n = document.querySelector(sel) as HTMLElement | null; const b = n?.getBoundingClientRect(); return b && b.height > 0 ? b : null; };
    const tb = r(".topbar"), con = r(".console");
    if (store.mode.kind === "memory") { cam.insetTop = cam.insetBottom = 0; return; }
    cam.insetTop = tb ? Math.max(0, tb.bottom + 6) : 0;
    cam.insetBottom = con ? Math.max(0, cam.h - con.top + 6) : 0;
  }
  window.addEventListener("resize", () => { measureInsets(); if (store.mode.kind === "system" && store.state) cam.flyTo(cam.x, cam.y, cam.fitScale(store.state.systemRadius * 1.05), 0.2); });
}
