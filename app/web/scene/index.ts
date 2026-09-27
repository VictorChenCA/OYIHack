// S1 Scene: Pixi v8 "tactical hologram" renderer for the C&C world (SPEC §3, §5, §6, §8, §9).
import { Application, Container, Graphics, Sprite, Text, TilingSprite, type Filter } from "pixi.js";
import type { DeptId, Enemy, Mine, Planet, Unit, WorldState } from "../../shared/types";
import type { Store, Target } from "../store";
import { loadTextures, tex, type TexName } from "./assets";
import { Camera } from "./camera";
import { GOLD, HOLO, QUAD_COLOR, arc, dashed, drawBlocker, fogTexture, hash, hex, label } from "./draw";
import { MOTHERSHIP_SIZE, SUBAGENT_SCALE, TIER_HULL, TIER_SCALE } from "../shapes";

const PLANET_TEX: Record<DeptId, TexName> = { engineering: "planet07", product: "planet01", design: "planet09", marketing: "planet02", operations: "planet04", product_design: "planet09", arts: "planet09" };
const PLANET_R = 70, SUN_R = 95;
/** Credit belt: one small asteroid ≈ one credit chunk, clustered per mine in a tight arc south of the sun. */
const BELT_R = 290, BELT_W = 80, ROCKS_PER_BUDGET = 40, CLUSTER_SPACING = 0.62;
const shortTxt = (t: string | undefined, n: number) => { const x = (t ?? "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };
function fmtDur(ms: number) { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; }

function sprite(name: TexName, opts: { tint?: number; add?: boolean; size?: number; alpha?: number } = {}) {
  const s = new Sprite(tex[name]); s.anchor.set(0.5);
  if (opts.tint !== undefined) s.tint = opts.tint;
  if (opts.add) s.blendMode = "add";
  if (opts.size) s.scale.set(opts.size / Math.max(1, s.texture.width));
  if (opts.alpha !== undefined) s.alpha = opts.alpha;
  return s;
}
const setSize = (s: Sprite, size: number) => s.scale.set(size / Math.max(1, s.texture.width));
/** Linear RGB mix a→b by t. */
const mix = (a: number, b: number, t: number) => {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh;
  return ch(16) | ch(8) | ch(0);
};

interface UnitView { hull: Graphics; x: number; y: number; rot: number; seen: number }
interface EnemyView { c: Container; g: Graphics; title: Text; x: number; y: number; seen: number; last: Enemy; born: number }
interface PlanetView { c: Container; base: Sprite; dept: Sprite; lights: Sprite[]; ring: Graphics; dish: Sprite; name: Text; cycle: Text; sum: Text }
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
    fog: new Container(), tethers: new Graphics(), enemies: new Container(), unitGlow: new Container(), units: new Container(), overlay: new Graphics(),
    fx: new Container(), labels: new Container(),
  };
  for (const k of Object.keys(L) as (keyof typeof L)[]) (k === "labels" ? top : world).addChild(L[k]);
  L.beams.blendMode = "add"; L.unitGlow.blendMode = "add";

  let nebula: TilingSprite, stars1: TilingSprite, stars2: TilingSprite, fog: Sprite;
  const bgFill = new Graphics();
  const sun = {} as { core: Sprite; l1: Sprite; l2: Sprite; halo: Sprite; ring: Sprite; flash: number };
  const research = {} as { gem: Sprite; shards: Sprite[]; twinkle: Sprite; glow: Sprite; name: Text };
  const planetViews = new Map<string, PlanetView>();
  const unitViews = new Map<string, UnitView>();
  const enemyViews = new Map<string, EnemyView>();
  const factoryViews = new Map<string, { s: Sprite; name: Text }>();
  /** Moon (recurring job) display positions by factory id. */
  const moonPos = new Map<string, { x: number; y: number }>();
  const mineViews = new Map<string, { rocks: Sprite[]; g: Graphics; glow: Sprite; name: Text }>();
  /** Cluster centers of the credit belt, by mine id (recomputed each frame). */
  const minePos = new Map<string, { x: number; y: number; a: number }>();
  const texts = new Map<string, { t: Text; seen: number }>(); // transient labels (cycles, squadrons, reasons)
  // Label declutter: lower number wins when two labels overlap; >= MINOR hides when zoomed out.
  const prio = new WeakMap<Text, number>();
  const MINOR = 4;
  /** System-view framing radius (x systemRadius): content (orbits + enemies) reaches ~0.9R; the band between HUD bars is short. */
  const SYS_FIT = 0.95;
  /** Fog of war: clear inside FOG_IN·R (charted space), darkening beyond it; the sprite reaches FOG_OUT·R. */
  const FOG_IN = 0.78, FOG_OUT = 4;
  const setPrio = <T extends Text>(t: T, p: number) => { prio.set(t, p); return t; };
  /** "Claude (subscription usage)" -> "CLAUDE", "River credits" -> "RIVER". */
  const shortMine = (s: string) => (s.replace(/\s*\(.*?\)\s*/g, " ").trim().split(/\s+/)[0] || s).toUpperCase();
  const packets: Sprite[] = [];
  const fxs: Fx[] = [];
  /** Memory writes already shown (at|op|slug); the first state marks history as seen without pulsing. */
  const seenWrites = new Set<string>();
  let writesPrimed = false;
  let sunHint: Text;
  /** "+ <what was added>" captions above the sun: newest first, ~9s each (fade over the last 1.5s), at most 2. */
  const CAPTION_S = 9;
  const sunCaptions: Text[] = [];
  const captions: { text: string; t: number; unitId?: string }[] = [];
  const lifts: Sprite[] = [];
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
    // nearly plain: deep navy-black, a faint starfield with a hint of parallax, nebula barely there
    nebula = new TilingSprite({ texture: tex.nebula, width: app.screen.width, height: app.screen.height }); nebula.alpha = 0.06; nebula.tint = 0x6f7fa8;
    stars1 = new TilingSprite({ texture: tex.starfield, width: app.screen.width, height: app.screen.height }); stars1.blendMode = "add"; stars1.alpha = 0.22;
    stars2 = new TilingSprite({ texture: tex.starfield, width: app.screen.width, height: app.screen.height }); stars2.blendMode = "add"; stars2.alpha = 0.12; stars2.tileScale.set(0.55);
    bg.addChild(bgFill, nebula, stars1, stars2);

    // sun
    sun.halo = sprite("circle_05", { tint: 0xff9a3c, add: true, size: SUN_R * 7, alpha: 0.35 });
    sun.l1 = sprite("light_03", { tint: 0xffd27a, add: true, size: SUN_R * 4.2, alpha: 0.55 });
    sun.l2 = sprite("light_01", { tint: 0xffb347, add: true, size: SUN_R * 3.4, alpha: 0.5 });
    sun.core = sprite("sphere1", { tint: 0xffb444, size: SUN_R * 2 });
    sun.ring = sprite("circle_02", { tint: 0xffd27a, add: true, size: SUN_R * 2.4, alpha: 0 });
    sun.flash = 0;
    L.sun.addChild(sun.halo, sun.l1, sun.l2, sun.core, sun.ring);
    for (let i = 0; i < 2; i++) { const t = setPrio(label("", 12, 0xe9dcc0, "IBM Plex Sans", "500"), 0); t.visible = false; sunCaptions.push(t); L.labels.addChild(t); }
    sunHint = setPrio(label("Open memory", 11, 0xcdb88a, "IBM Plex Sans", "500"), 0); sunHint.visible = false;
    L.labels.addChild(sunHint);

    // research station (River Sentinel)
    research.glow = sprite("circle_05", { tint: 0x40e0d0, add: true, size: 150, alpha: 0.3 });
    research.gem = sprite("meteor_squareLarge", { tint: 0x9fffef, size: 46 });
    research.shards = [0, 1, 2].map(() => sprite("meteor_small", { tint: 0x7fe9ff, size: 14 }));
    research.twinkle = sprite("star_08", { tint: 0xd8fffa, add: true, size: 70, alpha: 0.6 });
    research.name = setPrio(label("RESEARCH", 13, 0x9fffef), 2);
    L.research.addChild(research.glow, research.gem, ...research.shards, research.twinkle);
    L.labels.addChild(research.name);

    // fog of war: a clean radial falloff beyond the frontier (no drifting smoke)
    fog = new Sprite(fogTexture(FOG_IN / FOG_OUT)); fog.anchor.set(0.5);
    L.fog.addChild(fog);
    for (let i = 0; i < 24; i++) { const s = sprite("circle_05", { tint: 0x9fb8d8, add: true, alpha: 0 }); lifts.push(s); L.fog.addChild(s); }

    for (let i = 0; i < 64; i++) { const p = sprite("star_04", { tint: 0xffe2a0, add: true, size: 26, alpha: 0 }); packets.push(p); L.packets.addChild(p); }
    L.packets.blendMode = "add";
    built = true;
  }


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
    const name = setPrio(label(p.name.toUpperCase(), 18, hex(p.color)), 1);
    const cycle = setPrio(label("", 12, 0x8fa3b8, "IBM Plex Sans", "500"), 5);
    const sum = setPrio(label("", 12, 0xc4d2e2, "IBM Plex Sans", "500"), 4);
    L.planets.addChild(c); L.labels.addChild(name, cycle, sum);
    v = { c, base, dept, lights, ring, dish, name, cycle, sum };
    planetViews.set(p.id, v);
    return v;
  }

  /** One blocker language: shape + color = quadrant (the only thing the silhouette encodes); gold ring = needs a person. */
  function enemyView(e: Enemy): EnemyView {
    let v = enemyViews.get(e.id);
    if (v) return v;
    const c = new Container(); const g = new Graphics(); c.addChild(g);
    L.enemies.addChild(c);
    const title = setPrio(label("", 12, 0xffffff, "IBM Plex Sans", "600"), 0); L.labels.addChild(title);
    v = { c, g, title, x: e.pos.x, y: e.pos.y, seen: 0, last: e, born: frame > 30 ? time : -10 };
    enemyViews.set(e.id, v);
    return v;
  }

  function unitView(u: Unit): UnitView {
    let v = unitViews.get(u.id);
    if (v) return v;
    const hull = new Graphics();
    L.units.addChild(hull);
    v = { hull, x: u.pos.x, y: u.pos.y, rot: Math.atan2(u.target.y - u.pos.y, u.target.x - u.pos.x), seen: 0 };
    unitViews.set(u.id, v);
    return v;
  }
  /** Shared abstract hull (shapes.ts): same silhouette on the map, legend, hover and bottom bar. half = half-width in world units. */
  function drawHull(g: Graphics, u: Unit, half: number, col: number, ui: number) {
    const pts = TIER_HULL[u.role === "sentinel" ? "river" : u.tier] ?? TIER_HULL.unknown;
    g.clear();
    g.poly(pts.flatMap(([x, y]) => [x * half + half * 0.12, y * half + half * 0.12])).fill({ color: 0x000000, alpha: 0.25 }); // faint shadow
    g.poly(pts.flatMap(([x, y]) => [x * half, y * half])).fill({ color: col }).stroke({ width: Math.max(0.8, half * 0.08), color: 0xffffff, alpha: 0.28, join: "round" });
  }

  function tmpText(key: string, text: string, size: number, color: number, font = "Rajdhani"): Text {
    let e = texts.get(key);
    if (!e) { e = { t: setPrio(label(text, size, color, font, font === "Rajdhani" ? "700" : "500"), key.startsWith("squad:") ? 1 : key.startsWith("reason:") ? 2 : 3), seen: frame }; L.labels.addChild(e.t); texts.set(key, e); }
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
  const m0Kind = () => store.mode.kind;
  let userMoved = false;
  const planetK = () => Math.min(1.6, Math.max(1, cam.ui * 0.45));
  const isHot = (kind: string, id: string) => (store.hover?.kind === kind && store.hover.id === id) || (store.focus?.kind === kind && store.focus.id === id);
  const dimAlpha = (_planetId?: string) => 1; // planet view removes (not dims) other planets' things
  const projectColor = (s: WorldState, id: string) => hex(s.projects.find((p) => p.id === id)?.color, 0x9fe8ff);
  const unitHidden = (u: Unit) => u.hidden || u.status === "dead" || store.isHidden("unit", u.id, { planetId: u.planetId, projectId: u.projectId });
  const enemyHidden = (e: Enemy) => e.hidden || store.isHidden("enemy", e.id) || (e.planetIds.length > 0 && e.planetIds.every((p) => store.isHidden("planet", p)));
  /** Motherships ~3x subagents: the hierarchy should read at a glance. */
  /** Blocker radius: grows with how many agents it blocks; DROP (neither urgent nor important) stays small. */
  const blockerR = (e: Enemy, ui: number) => (16 + 5 * Math.min(8, Math.max(1, e.blocked.length))) * ui * (e.quadrant === "drop" ? 0.7 : 1);
  /** Full width in world units: MOTHERSHIP_SIZE × TIER_SCALE (subagents: same hull × SUBAGENT_SCALE). */
  const unitHalf = (u: Unit) => MOTHERSHIP_SIZE * 0.75 * (TIER_SCALE[u.tier] ?? 1) * (u.role === "subagent" ? SUBAGENT_SCALE : 1) * cam.ui;
  const unitSize = (u: Unit) => unitHalf(u) * 2;

  // ---------- per-frame ----------
  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000); time += dt; frame++;
    cam.update(Math.min(0.5, ticker.deltaMS / 1000)); // wall-clock so fly-tos finish even when frames are throttled
    top.position.copyFrom(world.position); top.scale.copyFrom(world.scale);
    const s = store.state;
    if (!built || !s) return;
    if (!fitted) { fitted = true; measureInsets(); cam.minScale = 0.02; const f = systemFrame(s); cam.minScale = f.s * 0.7; cam.x = f.x; cam.y = f.y; cam.scale = f.s; cam.update(0); }
    if (frame % 60 === 0) { const ms = cam.minScale; cam.minScale = 0.02; const f = systemFrame(s); cam.minScale = Math.max(0.02, f.s * 0.7); if (Math.abs(cam.minScale - ms) > 1e-4 && cam.scale < cam.minScale) cam.scale = cam.minScale; } // max zoom-out: whole system + frontier with a margin
    if (frame % 20 === 0 && !userMoved && (m0Kind() === "system" || m0Kind() === "planet")) {
      const t0 = cam.insetTop, b0 = cam.insetBottom; measureInsets();
      if (Math.abs(cam.insetTop - t0) > 8 || Math.abs(cam.insetBottom - b0) > 8) flyToMode();
    }
    const R = s.systemRadius, ui = cam.ui;
    const PK = planetK(), PR = PLANET_R * PK; // displayed planet radius
    const m0 = mode(); const pm: DeptId | null = m0.kind === "planet" ? m0.planetId : null;
    const inPm = (pid?: string) => !pm || pid === pm; // planet view REMOVES everything that is not this planet's
    bgFill.clear().rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x05070d });

    // background parallax
    for (const t of [nebula, stars1, stars2]) { t.width = app.screen.width; t.height = app.screen.height; }
    nebula.tilePosition.set(-cam.x * cam.scale * 0.03, -cam.y * cam.scale * 0.03);
    stars1.tilePosition.set(-cam.x * cam.scale * 0.08, -cam.y * cam.scale * 0.08);
    stars2.tilePosition.set(-cam.x * cam.scale * 0.12, -cam.y * cam.scale * 0.12);

    // sun = GBrain, the company memory. Static and calm; one clean pulse per memory WRITE (reads do nothing visible),
    // with a one-line caption of what was just added.
    const byIdU = new Map(s.units.map((u) => [u.id, u] as const));
    const writes = s.knowledge?.recent?.filter((m) => m.kind === "write") ?? [];
    let fresh: (typeof writes)[number] | null = null;
    for (const w of writes) {
      const key = `${w.at}|${w.op}|${w.slug ?? ""}`;
      if (seenWrites.has(key)) continue;
      seenWrites.add(key);
      if (writesPrimed && (!fresh || w.at >= fresh.at)) fresh = w;
    }
    writesPrimed = true;
    if (seenWrites.size > 400) { const keep = [...seenWrites].slice(-200); seenWrites.clear(); keep.forEach((k) => seenWrites.add(k)); }
    if (fresh) {
      sun.flash = 1; spawnFx("circle_02", 0, 0, 0xffd27a, SUN_R * 2.1, SUN_R * 3.6, 1.8, 0.4);
      const txt = (fresh.text ?? fresh.slug ?? fresh.op ?? "").replace(/\s+/g, " ").trim();
      const who = fresh.unitId ? byIdU.get(fresh.unitId)?.label : undefined;
      captions.unshift({ text: "+ " + shortTxt(txt || "memory updated", 56) + (who ? `  · ${shortTxt(who, 18)}` : ""), t: 0, unitId: fresh.unitId });
      captions.length = Math.min(captions.length, 2); // stack at most 2 lines
    }
    sun.flash = Math.max(0, sun.flash - dt * 0.9);
    // static sun: no rotation, no breathing; the one pulse is the memory write
    sun.halo.alpha = 0.26 + 0.12 * sun.flash;
    sun.l1.alpha = 0.36 + 0.12 * sun.flash; sun.l2.alpha = 0.34;
    sun.ring.alpha = 0;
    sun.core.tint = 0xffb444;
    L.sun.alpha = 1; L.sun.scale.set(pm ? 0.6 : 1); // team view: the sun stays (it is their memory), smaller
    const sunR = SUN_R * (pm ? 0.6 : 1);
    for (const c of captions) c.t += dt;
    while (captions.length && captions[captions.length - 1].t > CAPTION_S) captions.pop();
    {
      // sit above the sun, clear of the research station when it is right there
      const rp = s.research?.pos; let capY = -sunR - 22 * ui;
      if (rp && !pm && store.layerOn("research") && Math.abs(rp.x) < 160 * ui && Math.abs(capY - rp.y) < 34 * ui) capY = rp.y - 34 * ui;
      sunCaptions.forEach((tx, i) => {
        const c = captions[i];
        tx.visible = !!c;
        if (!c) return;
        if (tx.text !== c.text) tx.text = c.text;
        tx.alpha = Math.min(1, c.t / 0.4) * Math.min(1, Math.max(0, (CAPTION_S - c.t) / 1.5)) * (i === 0 ? 0.92 : 0.6);
        tx.scale.set(ui * 0.95); tx.position.set(0, capY - i * 18 * ui);
      });
    }
    sunHint.visible = store.hover?.kind === "sun"; sunHint.scale.set(ui * 0.9); sunHint.position.set(0, sunR + 20 * ui);

    // teams: server positions only (distance from the sun = distance from what the company knows). No orbit rings.
    L.orbits.clear();
    for (const p of s.planets) {
      const v = planetView(p);
      const hidden = p.hidden || store.isHidden("planet", p.id) || !inPm(p.id);
      v.c.visible = !hidden; v.name.visible = !hidden && store.layerOn("labels"); v.cycle.visible = false; v.sum.visible = false;
      if (hidden) continue;
      const col = hex(p.color), da = dimAlpha(p.id);
      // planet body
      v.c.position.set(p.pos.x, p.pos.y); v.c.alpha = da; v.c.scale.set(PK);
      const stage = 0; // clean planets: no colonization stages, rings, lights or satellites
      v.dept.alpha = 1; v.base.alpha = 0;
      // static (no spin). Operations shares the base texture: tint it gently with the team color so it reads distinct.
      v.dept.tint = mix(0xffffff, col, 0.3);
      const away = Math.atan2(p.pos.y, p.pos.x); // night side faces away from the sun
      v.lights.forEach((l, i) => {
        l.visible = stage >= 2;
        const aa = away + (hash(p.id + i) - 0.5) * 2.2, rr = PLANET_R * (0.35 + 0.5 * hash(i + p.id));
        l.position.set(Math.cos(aa) * rr, Math.sin(aa) * rr); l.alpha = 0.6;
      });
      v.ring.clear();
      if (stage >= 3) {
        v.ring.ellipse(0, 0, PLANET_R * 1.55, PLANET_R * 0.42).stroke({ width: 3, color: col, alpha: 0.55 });
        v.ring.rotation = -0.35;
      }
      const sunDir = away + Math.PI;
      v.dish.position.set(Math.cos(sunDir) * PLANET_R * 1.15, Math.sin(sunDir) * PLANET_R * 1.15); v.dish.rotation = sunDir + Math.PI / 2;
      v.dish.visible = stage >= 1;
      v.name.position.set(p.pos.x, p.pos.y + PR + 16 * ui); v.name.scale.set(ui); v.name.alpha = da;
    }

    // credit belt: per mine, a cluster of small spinning asteroids (one ≈ one credit chunk) close to the sun
    const mines = (s.mines ?? []).filter((m) => !m.hidden && !store.isHidden("mine", m.id));
    L.belt.visible = false; // only the credit clusters, no decorative dust
    L.mines.visible = store.layerOn("mines");
    const seenMine = new Set<string>();
    const ordered = [...mines].sort((a, b) => Math.atan2(a.pos.y, a.pos.x) - Math.atan2(b.pos.y, b.pos.x));
    minePos.clear();
    ordered.forEach((m, mi) => { const a = Math.PI / 2 + (mi - (ordered.length - 1) / 2) * CLUSTER_SPACING; minePos.set(m.id, { x: Math.cos(a) * BELT_R, y: Math.sin(a) * BELT_R, a }); });
    // planet view keeps only the mine this planet's agents burn (Claude, while its motherships work)
    const burning = (m: Mine) => !pm || (m.id === "claude" && s.units.some((u) => u.planetId === pm && u.role === "mothership" && (u.status === "working" || u.status === "acting" || u.status === "attacking")));
    for (const m of ordered) {
      if (!burning(m)) continue;
      seenMine.add(m.id);
      let v = mineViews.get(m.id);
      if (!v) {
        v = { rocks: [], g: new Graphics(), glow: sprite("circle_05", { add: true, alpha: 0 }), name: setPrio(label("", 12, 0xdbe8f5, "IBM Plex Sans", "600"), 2) };
        L.mines.addChild(v.g); L.labels.addChild(v.name); mineViews.set(m.id, v);
      }
      const frac = m.total > 0 ? Math.max(0, Math.min(1, m.remaining / m.total)) : 0;
      const col = hex(m.color);
      const n = m.remaining > 0 ? Math.max(3, Math.round(4 + 14 * frac)) : 0; // count ∝ remaining
      const c = minePos.get(m.id)!;
      const rockCol = mix(0x8d939c, col, 0.35), px = 1 / cam.scale; // world units per screen px
      const hotM = isHot("mine", m.id);
      v.g.clear();
      for (let i = 0; i < n; i++) {
        const h1 = hash(m.id + ":a" + i), h2 = hash(m.id + ":r" + i), h3 = hash(m.id + ":s" + i), h4 = hash(m.id + ":w" + i);
        const ang = c.a + (h1 - 0.5) * CLUSTER_SPACING * 0.8, rr = BELT_R + (h2 - 0.5) * BELT_W * 0.8;
        const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr, rad = (1.5 + 3 * h3) * px; // 3–9 px across
        const pts: number[] = [];
        for (let j = 0; j < 7; j++) { const t = (j / 7) * Math.PI * 2 + h4 * 6.28, k = 0.72 + 0.28 * hash(m.id + ":" + i + ":" + j); pts.push(x + Math.cos(t) * rad * k, y + Math.sin(t) * rad * k); }
        v.g.poly(pts).fill({ color: rockCol, alpha: 0.95 }).stroke({ width: 0.8 * px, color: hotM ? col : 0xffffff, alpha: hotM ? 0.9 : 0.18 });
      }
      v.name.visible = store.layerOn("mines") && store.layerOn("labels") && (isHot("mine", m.id));
      const nm = shortMine(m.label); const title = nm.charAt(0) + nm.slice(1).toLowerCase();
      const val = `${title} credits $${Math.round(m.remaining)} left · $${Math.round(m.burnPerDay)}/day`; if (v.name.text !== val) v.name.text = val;
      v.name.tint = frac < 0.2 ? 0xff6b6b : col;
      const mi = ordered.indexOf(m), lr = BELT_R + BELT_W / 2 + (14 + (mi % 2) * 16) * ui; v.name.scale.set(ui * 0.85); v.name.position.set(Math.cos(c.a) * lr, Math.sin(c.a) * lr);
    }
    for (const [id, v] of mineViews) if (!seenMine.has(id)) { v.g.destroy(); v.glow.destroy(); v.name.destroy(); mineViews.delete(id); }

    // research station
    L.research.visible = store.layerOn("research") && !pm;
    research.name.visible = L.research.visible && store.layerOn("labels") && isHot("research", "research");
    const rpos = s.research?.pos ?? { x: 0, y: -200 };
    const running = s.research?.runs?.some((r) => r.status === "running") ?? false;
    L.research.position.set(rpos.x, rpos.y);
    research.shards.forEach((sh) => { sh.visible = false; });
    research.twinkle.alpha = 0;
    research.glow.alpha = running ? 0.4 : 0.16;
    research.gem.filters = running && glowGem ? [glowGem] : null;
    research.name.position.set(rpos.x, rpos.y + 44 * ui); research.name.scale.set(ui);

    // factories
    L.factories.visible = store.layerOn("factories");
    const seenF = new Set<string>();
    const ov = L.overlay; ov.clear();
    moonPos.clear();
    const moonIdx = new Map<string, number>();
    for (const f of s.factories ?? []) {
      if (f.hidden || store.isHidden("factory", f.id, { planetId: f.planetId }) || !inPm(f.planetId)) continue;
      const pl = s.planets.find((q) => q.id === f.planetId); if (!pl || pl.hidden || store.isHidden("planet", pl.id)) continue;
      seenF.add(f.id);
      let v = factoryViews.get(f.id);
      if (!v) { v = { s: sprite("sphere1"), name: setPrio(label("", 11, 0xd6e0ea, "IBM Plex Sans", "500"), 1) }; L.factories.addChild(v.s); L.labels.addChild(v.name); factoryViews.set(f.id, v); }
      // one orbit per cycle; the job fires at the top (angle = progress to its next run)
      const frac = Math.max(0, Math.min(1, 1 - (f.nextRunAt - s.now) / Math.max(1, f.cadenceMs)));
      const i = moonIdx.get(f.planetId) ?? 0; moonIdx.set(f.planetId, i + 1);
      const orb = PR * (1.45 + 0.28 * i), ang = -Math.PI / 2 + 2 * Math.PI * frac;
      const mx = pl.pos.x + Math.cos(ang) * orb, my = pl.pos.y + Math.sin(ang) * orb;
      moonPos.set(f.id, { x: mx, y: my });
      const hotF = isHot("factory", f.id);
      if (L.factories.visible) ov.circle(pl.pos.x, pl.pos.y, orb).stroke({ width: 1 * ui, color: 0x9fb3c8, alpha: hotF ? 0.35 : 0.1 });
      setSize(v.s, (hotF ? 22 : 16) * ui); v.s.position.set(mx, my);
      v.s.tint = f.paused ? 0x6b7078 : mix(0xd8dee6, hex(pl.color), 0.25);
      v.s.alpha = f.paused ? 0.4 : 1;
      const nm = `${f.label} · ${f.schedule ?? fmtDur(f.cadenceMs)}${f.paused ? " · paused" : ""}`;
      if (v.name.text !== nm) v.name.text = nm;
      v.name.scale.set(ui * 0.9); v.name.position.set(mx, my - 18 * ui);
      v.name.visible = L.factories.visible && store.layerOn("labels") && hotF;
    }
    for (const [id, v] of factoryViews) if (!seenF.has(id)) { v.s.destroy(); v.name.destroy(); factoryViews.delete(id); }

    // energy beams sun → colony + packets
    const bm = L.beams; bm.clear();
    let pk = 0;
    const SUN_BEAMS = false; // no lanes toward the sun
    if (SUN_BEAMS && store.layerOn("beams")) for (const p of s.planets) {
      if (p.hidden || store.isHidden("planet", p.id) || !inPm(p.id) || (p.colonization ?? 0) < 1) continue;
      const d = Math.hypot(p.pos.x, p.pos.y) || 1, ux = p.pos.x / d, uy = p.pos.y / d;
      const x0 = ux * SUN_R * 1.05, y0 = uy * SUN_R * 1.05, x1 = p.pos.x - ux * PR * 1.2, y1 = p.pos.y - uy * PR * 1.2;
      const k = (0.25 + 0.75 * (p.memTraffic ?? 0)) * dimAlpha(p.id), col = 0xffd27a;
      bm.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 5 * ui, color: col, alpha: 0.05 * k });
      bm.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1.2 * ui, color: 0xfff3d6, alpha: 0.35 * k });
      const n = Math.round(3 * (p.memTraffic ?? 0)); // packets = actual memory traffic
      for (let i = 0; i < 0 && pk < packets.length; i++, pk++) { // no moving packets (decorative)
        const t = (time * (0.06 + 0.1 * (p.memTraffic ?? 0)) + i / n + hash(p.id)) % 1;
        const q = packets[pk]; q.position.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); q.alpha = Math.sin(Math.PI * t) * k * 0.7; setSize(q, 16 * ui); q.rotation = 0;
      }
    }
    for (let i = pk; i < packets.length; i++) packets[i].alpha = 0;

    // units: motherships first so subagents can hang off their display position
    const showUnits = store.layerOn("units");
    const visUnits: Unit[] = [];
    const disp = new Map<string, { x: number; y: number }>();
    const lerpK = 1 - Math.exp(-dt * 6);
    const sel0 = new Set(store.selection);
    const byId = new Map(s.units.map((u) => [u.id, u] as const));
    const active = (u: Unit) => u.status === "working" || u.status === "acting" || u.status === "attacking";
    // idle motherships park in a neat arc on the night side of their colony (not scattered)
    const parked = new Map<string, { x: number; y: number; face: number }>();
    for (const p of s.planets) {
      const idle = s.units.filter((u) => u.planetId === p.id && u.role === "mothership" && (u.status === "idle" || u.status === "done") && !unitHidden(u)).sort((a, b) => a.id.localeCompare(b.id));
      const away = Math.atan2(p.pos.y, p.pos.x), per = 5;
      idle.forEach((u, i) => {
        const row = Math.floor(i / per), inRow = Math.min(per, idle.length - row * per), c = i % per;
        const a = away + (c - (inRow - 1) / 2) * 0.36, r = PR * 1.7 + row * 46;
        parked.set(u.id, { x: p.pos.x + Math.cos(a) * r, y: p.pos.y + Math.sin(a) * r, face: away });
      });
    }
    // sub-sites: subagents fan out around their mothership's task site and shuttle back and forth
    const subSite = new Map<string, { x: number; y: number }>();
    const kids = new Map<string, Unit[]>();
    for (const u of s.units) if (u.role === "subagent" && u.parentId) (kids.get(u.parentId) ?? kids.set(u.parentId, []).get(u.parentId)!).push(u);
    for (const [pid, ks] of kids) {
      const par = byId.get(pid); if (!par) continue;
      ks.sort((a, b) => a.id.localeCompare(b.id));
      const dir = Math.atan2(par.target.y - par.home.y, par.target.x - par.home.x);
      ks.forEach((k, j) => { const a = dir + (j - (ks.length - 1) / 2) * 0.7; const r = 90 + (j % 2) * 26; subSite.set(k.id, { x: par.target.x + Math.cos(a) * r, y: par.target.y + Math.sin(a) * r }); });
    }
    // emphasis: the selected agent (with its family) or planet stays bright; everything else fades
    const family = (t: Target | null): Set<string> | null => {
      if (!t) return null;
      if (t.kind === "unit") { const u = byId.get(t.id); if (!u) return null; const rootId = u.parentId ?? u.id; return new Set(s.units.filter((q) => q.id === rootId || q.parentId === rootId).map((q) => q.id)); }
      if (t.kind === "planet") return new Set(s.units.filter((q) => q.planetId === t.id).map((q) => q.id));
      if (t.kind === "enemy") { const e = s.enemies.find((q) => q.id === t.id); return e ? new Set([...e.blocked, ...e.attackers]) : null; }
      return null;
    };
    const focusSet = (pm && store.focus?.kind === "planet") ? null : family(store.focus) ?? (store.selection.length ? new Set(store.selection) : null);
    const hoverSet = family(store.hover);
    const emph = (id: string) => focusSet ? (focusSet.has(id) ? 1 : hoverSet?.has(id) ? 0.6 : 0.25) : hoverSet ? (hoverSet.has(id) ? 1 : 0.55) : 1;
    const order = [...s.units].sort((a, b) => (a.role === "subagent" ? 1 : 0) - (b.role === "subagent" ? 1 : 0));
    for (const u of order) {
      if (!showUnits || unitHidden(u) || !inPm(u.planetId)) continue;
      visUnits.push(u);
      const v = unitView(u); v.seen = frame;
      const pk = parked.get(u.id), ss = subSite.get(u.id), par = u.parentId ? disp.get(u.parentId) : undefined;
      let goal: { x: number; y: number } = pk ?? u.pos, heading: { x: number; y: number } = u.target;
      void ss; void par; // subagents follow the server's outward law from their mothership (no shuttling)
      v.x += (goal.x - v.x) * lerpK; v.y += (goal.y - v.y) * lerpK;
      if (Math.hypot(goal.x - v.x, goal.y - v.y) > 800) { v.x = goal.x; v.y = goal.y; }
      disp.set(u.id, { x: v.x, y: v.y });
      const col = projectColor(s, u.projectId);
      const size = unitSize(u), k = emph(u.id);
      const en = u.attacking ? s.enemies.find((e) => e.id === u.attacking) : undefined;
      const tgt = en ? en.pos : pk ? { x: v.x + Math.cos(pk.face) * 10, y: v.y + Math.sin(pk.face) * 10 } : heading;
      const want = Math.atan2(tgt.y - v.y, tgt.x - v.x);
      let dr = want - v.rot; while (dr > Math.PI) dr -= 2 * Math.PI; while (dr < -Math.PI) dr += 2 * Math.PI;
      if (Math.hypot(tgt.x - v.x, tgt.y - v.y) > 1) v.rot += dr * lerpK;
      const hcol = u.role === "sentinel" ? 0x9fffef : u.status === "done" ? 0x8a8f98 : col;
      drawHull(v.hull, u, size / 2, hcol, ui);
      v.hull.position.set(v.x, v.y); v.hull.rotation = v.rot;
      v.hull.alpha = (u.status === "done" ? (u.role === "subagent" ? 0.3 : 0.5) : u.status === "idle" ? 0.65 : 1) * k;
      const focused = store.focus?.kind === "unit" && store.focus.id === u.id;
      const uHot = focused || sel0.has(u.id) || (store.hover?.kind === "unit" && store.hover.id === u.id);
      if (store.layerOn("labels") && (uHot || (cam.scale > 0.9 && u.role !== "subagent"))) {
        const t = tmpText(`unit:${u.id}`, u.label, 12, col, "IBM Plex Sans"); t.position.set(v.x, v.y + size * 0.8); t.scale.set(ui * 0.9); t.alpha = k;
      }
    }
    for (const [id, v] of unitViews) if (v.seen !== frame) { v.hull.destroy(); unitViews.delete(id); }

    // enemies
    const showEnemies = store.layerOn("enemies");
    const enemyInPm = (e: Enemy) => !pm || e.planetIds.includes(pm) || e.blocked.some((id) => byId.get(id)?.planetId === pm) || e.attackers.some((id) => byId.get(id)?.planetId === pm);
    const enemyEmph = (e: Enemy) => {
      const on = (set: Set<string> | null) => !!set && ((store.focus?.kind === "enemy" && store.focus.id === e.id) || e.blocked.some((id) => set.has(id)) || e.attackers.some((id) => set.has(id)));
      return focusSet ? (on(focusSet) || (store.focus?.kind === "enemy" && store.focus.id === e.id) ? 1 : 0.3) : hoverSet ? (on(hoverSet) ? 1 : 0.6) : 1;
    };
    const enemyPos = new Map<string, { x: number; y: number; r: number }>();
    for (const e of s.enemies) {
      if (!showEnemies || enemyHidden(e) || !enemyInPm(e)) continue;
      const v = enemyView(e); v.seen = frame; v.last = e;
      v.x += (e.pos.x - v.x) * lerpK; v.y += (e.pos.y - v.y) * lerpK;
      const qc = QUAD_COLOR[e.quadrant] ?? QUAD_COLOR.do_now;
      const r = blockerR(e, ui);
      enemyPos.set(e.id, { x: v.x, y: v.y, r });
      v.c.position.set(v.x, v.y);
      // the only motion: a slow, subtle breathe on DO NOW (urgent + important)
      const k = 1;
      drawBlocker(v.g, e.quadrant, r * k, qc, ui);
      if (e.humanOnly) v.g.circle(0, 0, r * 1.45).stroke({ width: 1.5 * ui, color: GOLD, alpha: 0.9 });
      v.c.alpha = enemyEmph(e) * Math.min(1, Math.max(0, (time - v.born) / 0.5));
      if (e.resolved) v.c.alpha *= 0.4;
      const tt = e.title;
      if (v.title.text !== tt) v.title.text = tt;
      v.title.tint = 0xe8eef6; v.title.alpha = v.c.alpha;
      v.title.visible = store.layerOn("labels") && isHot("enemy", e.id); v.title.scale.set(ui); v.title.position.set(v.c.x, v.c.y + r * (e.humanOnly ? 1.45 : 1.1) + 12 * ui);
    }
    for (const [id, v] of enemyViews) if (v.seen !== frame) {
      const stillThere = s.enemies.some((e) => e.id === id);
      if (!stillThere || v.last.resolved) spawnFx("circle_02", v.x, v.y, 0x5cf2b0, 40, 160, 0.8, 0.5); // resolved: one quiet ring
      v.c.destroy({ children: true }); v.title.destroy(); enemyViews.delete(id);
    }

    // lanes + task sites. Mothership: colony -> its task site (solid glowing lane = charted route; dotted fading lane = frontier).
    // Subagent: short dashed lane from its mothership to a sub-site fanned around that site.
    const pg = L.paths; pg.clear();
    const claude = mines.find((m) => m.id === "claude");
    const showPaths = store.layerOn("paths");
    if (showPaths) {
      const sites = new Map<string, { x: number; y: number; col: number; charted: boolean; k: number; text: string; eta: string; hot: boolean }>();
      for (const u of visUnits) {
        if (u.role !== "mothership" || parked.has(u.id)) continue;
        const col = projectColor(s, u.projectId), k = emph(u.id);
        const hx = u.home.x, hy = u.home.y, tx = u.target.x, ty = u.target.y;
        if (u.charted) { // dotted time line: home → where the task is expected to end
          dashed(pg, hx, hy, tx, ty, 1.5 * ui, 9 * ui);
          pg.stroke({ width: 2 * ui, color: col, alpha: 0.5 * k, cap: "round" });
        } else {
          const N = 6;
          for (let j = 0; j < N; j++) {
            const a0 = j / N, a1 = (j + 1) / N;
            dashed(pg, hx + (tx - hx) * a0, hy + (ty - hy) * a0, hx + (tx - hx) * a1, hy + (ty - hy) * a1, 1.5 * ui, 9 * ui);
            pg.stroke({ width: 2.2 * ui, color: col, alpha: 0.55 * k * (1 - (j / N) * 0.85), cap: "round" });
          }
        }
        const key = `${Math.round(tx / 20)},${Math.round(ty / 20)}`;
        const end = u.etaMs == null ? null : u.etaMs > 1e12 ? u.etaMs : u.startedAt + u.etaMs;
        const eta = !u.charted || end == null ? "?" : end - s.now > 0 ? fmtDur(end - s.now) : "due";
        const hot = !!(focusSet?.has(u.id) || hoverSet?.has(u.id));
        const prev = sites.get(key);
        if (!prev || k > prev.k) sites.set(key, { x: tx, y: ty, col, charted: u.charted, k, text: shortTxt(u.siteLabel ?? u.task ?? u.label, 28), eta, hot: hot || !!prev?.hot });
      }
      // subagent sub-lanes + sub-site dots
      for (const u of visUnits) {
        const ss = subSite.get(u.id), par = u.parentId ? disp.get(u.parentId) : undefined;
        if (!ss || !par || u.status === "done") continue;
        const col = projectColor(s, u.projectId), k = emph(u.id);
        dashed(pg, par.x, par.y, ss.x, ss.y, 4 * ui, 5 * ui);
        pg.stroke({ width: 1 * ui, color: col, alpha: 0.4 * k });
        pg.circle(ss.x, ss.y, 3 * ui).fill({ color: col, alpha: 0.7 * k });
      }
      // task-site markers: diamond beacon; label only when selected/hovered or zoomed in
      for (const [key, st] of sites) {
        const d = 9 * ui, k = st.k;
        pg.poly([st.x, st.y - d, st.x + d, st.y, st.x, st.y + d, st.x - d, st.y]).fill({ color: st.col, alpha: 0.16 * k }).stroke({ width: 1.6 * ui, color: st.col, alpha: (st.charted ? 0.9 : 0.55) * k });
        pg.circle(st.x, st.y, 2 * ui).fill({ color: 0xffffff, alpha: 0.9 * k });
        if (store.layerOn("labels") && (st.hot || (pm && cam.scale > 0.3) || cam.scale > 0.9)) {
          const t = tmpText(`site:${key}`, `${st.text}  ${st.eta}`, 11, st.col, "IBM Plex Sans"); t.position.set(st.x, st.y - d - 11 * ui); t.scale.set(ui * 0.9); t.alpha = k;
        }
      }
      // mining: flowing credit dots from each working mothership to the Claude cluster it burns
      const cp = claude ? minePos.get(claude.id) : undefined;
      const NO_SUN_LANES = true; // no lanes toward the sun / credit clusters
      if (!NO_SUN_LANES && claude && cp && mineViews.has(claude.id)) {
        let n = 0;
        for (const u of visUnits) {
          if (n > 60) break;
          if (u.role !== "mothership" || !active(u)) continue;
          if (!pm && !(focusSet?.has(u.id) || hoverSet?.has(u.id))) continue;
          const p = disp.get(u.id)!; n++;
          dashed(pg, p.x, p.y, cp.x, cp.y, 2.5 * ui, 16 * ui, -time * 40 * ui);
          pg.stroke({ width: 1.6 * ui, color: hex(claude.color), alpha: 0.22 * emph(u.id), cap: "round" });
        }
      }
    }

    // tethers
    const tg = L.tethers; tg.clear();
    const hov = store.hover;
    for (const k of texts.keys()) if (k.startsWith("reason:")) texts.get(k)!.t.visible = false;
    if (store.layerOn("tethers")) {
      // blocked unit → enemy
      for (const e of s.enemies) {
        const ep = enemyPos.get(e.id); if (!ep) continue;
        const qc = QUAD_COLOR[e.quadrant] ?? QUAD_COLOR.do_now;
        const hot = (hov?.kind === "enemy" && hov.id === e.id) || (store.focus?.kind === "enemy" && store.focus.id === e.id);
        let said = false; // the reason is shown once per blocker, not on every tether
        for (const id of e.blocked) {
          const a = disp.get(id); if (!a) continue;
          dashed(tg, a.x, a.y, ep.x, ep.y, 6 * ui, 6 * ui);
          if (emph(id) < 1) { tg.stroke({ width: 1 * ui, color: qc, alpha: 0.35 * emph(id) }); }
          if ((hot && !said) || (hov?.kind === "unit" && hov.id === id)) { said = true;
            const t = tmpText(`reason:${e.id}:${id}`, e.reason, 13, qc, "IBM Plex Sans");
            t.position.set((a.x + ep.x) / 2, (a.y + ep.y) / 2 - 10 * ui); t.scale.set(ui);
          }
        }
        tg.stroke({ width: (hot ? 1.6 : 1) * ui, color: qc, alpha: hot ? 0.85 : 0.35 });
        if (e.kind === "dependency" && e.dependsOnUnit) {
          const d = disp.get(e.dependsOnUnit);
          if (d) { dashed(tg, ep.x, ep.y, d.x, d.y, 3 * ui, 7 * ui); tg.stroke({ width: 1 * ui, color: 0x9aa6b8, alpha: 0.5 }); }
        }
        // agents sent to resolve it: one steady line (no bolts/sparks)
        for (const id of e.attackers) {
          const a = disp.get(id); if (!a) continue;
          tg.moveTo(a.x, a.y).lineTo(ep.x, ep.y);
        }
        if (e.attackers.length) tg.stroke({ width: 1.4 * ui, color: 0x5cf2b0, alpha: 0.7 });
      }
    }

    // dependency graph for the hovered / focused agent: its dependsOn agents, same-project agents (thin), memory writes → sun
    {
      const t = store.hover?.kind === "unit" ? store.hover : store.focus?.kind === "unit" ? store.focus : null;
      const u = t ? byId.get(t.id) : undefined;
      const a = u ? disp.get(u.id) : undefined;
      if (u && a) {
        const col = projectColor(s, u.projectId);
        for (const id of u.dependsOn ?? []) { const d = disp.get(id); if (!d) continue; dashed(tg, a.x, a.y, d.x, d.y, 4 * ui, 5 * ui); tg.stroke({ width: 1.6 * ui, color: 0xd6dde8, alpha: 0.8 }); }
        for (const q of visUnits) if (q.id !== u.id && q.role === "mothership" && q.projectId === u.projectId && q.parentId !== u.id) { const d = disp.get(q.id); if (d) tg.moveTo(a.x, a.y).lineTo(d.x, d.y); }
        tg.stroke({ width: 0.8 * ui, color: col, alpha: 0.3 });
        for (const k of visUnits) if (k.parentId === u.id) { const d = disp.get(k.id); if (d) tg.moveTo(a.x, a.y).lineTo(d.x, d.y); }
        tg.stroke({ width: 1.2 * ui, color: col, alpha: 0.7 });
        const wrote = (s.knowledge?.recent ?? []).some((m) => m.kind === "write" && m.unitId === u.id);
        if (wrote) { dashed(tg, a.x, a.y, 0, 0, 2 * ui, 10 * ui); tg.stroke({ width: 1 * ui, color: 0xffd27a, alpha: 0.35 }); }
      }
    }

    // unit overlay: hp ring, status marks, selection
    const sel = new Set(store.selection);
    for (const u of visUnits) {
      const p = disp.get(u.id)!; const r = unitSize(u) * 0.75; const da = emph(u.id);
      const look = sel.has(u.id) || (hov?.kind === "unit" && hov.id === u.id) || (store.focus?.kind === "unit" && store.focus.id === u.id);
      if (look) {
        const hp = Math.max(0, Math.min(1, u.hp));
        arc(ov, p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * hp);
        ov.stroke({ width: 1.6 * ui, color: hp > 0.5 ? 0x5cf2b0 : hp > 0.25 ? 0xffb020 : 0xff4d4d, alpha: 0.6 * da });
      }
      if (u.status === "blocked") ov.circle(p.x, p.y, r * 1.35).stroke({ width: 1.2 * ui, color: 0xff5a5a, alpha: 0.6 * da });
      if (u.status === "acting") ov.circle(p.x + r * 0.9, p.y - r * 0.9, 2.5 * ui).fill({ color: 0xffffff, alpha: 0.9 * da });
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
        const m = minePos.get(id); if (m) return { x: m.x, y: m.y, r: 60 };
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
        : hov.kind === "planet" ? (() => { const p = s.planets.find((q) => q.id === hov.id); return p ? { ...p.pos, r: PR * 1.1 } : undefined; })()
        : hov.kind === "sun" ? { x: 0, y: 0, r: SUN_R * (pm ? 0.6 : 1) * 1.05 } : undefined;
      if (w) ov.circle(w.x, w.y, w.r * 1.25 + 4 * ui).stroke({ width: 1.2 * ui, color: 0xe8f6ff, alpha: 0.55 });
    }
    // focus ring for non-unit focus
    const fo = store.focus;
    if (fo && fo.kind !== "unit") {
      const w = fo.kind === "enemy" ? enemyPos.get(fo.id) : fo.kind === "planet" ? (() => { const p = s.planets.find((q) => q.id === fo.id); return p ? { ...p.pos, r: PR * 1.25 } : undefined; })() : undefined;
      if (w) ov.circle(w.x, w.y, w.r * 1.3 + 4 * ui).stroke({ width: 1.6 * ui, color: 0xe8f6ff, alpha: 0.8 });
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
    fog.width = fog.height = R * 2 * FOG_OUT; // clear to FOG_IN·R (what the company has charted), darker beyond
    // the fog lifts a little around places agents have already reached out there
    let li = 0;
    for (const u of visUnits) {
      if (li >= lifts.length || u.role === "subagent") continue;
      const d = disp.get(u.id); if (!d) continue;
      for (const q of [d, u.target]) {
        if (li >= lifts.length || Math.hypot(q.x, q.y) < R * (FOG_IN - 0.05)) continue;
        const l = lifts[li++]; l.position.set(q.x, q.y); setSize(l, 360); l.alpha = 0.07;
      }
    }
    for (let i = li; i < lifts.length; i++) lifts[i].alpha = 0;

    // gc transient labels
    for (const [k, e] of texts) if (e.seen !== frame) { if (frame - e.seen > 120) { e.t.destroy(); texts.delete(k); } else e.t.visible = false; }
    L.labels.visible = store.layerOn("labels") || true;
    for (const [k, e] of texts) if (k.startsWith("squad:") && !store.layerOn("labels")) e.t.visible = false;
    declutter(cam.scale / cam.fitScale(R * SYS_FIT));
  });

  /** Greedy label placement: keep higher-priority labels, hide ones that would overlap them; drop minor labels when zoomed out. */
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  function declutter(zoomRel: number) {
    const cand: { t: Text; p: number }[] = [];
    for (const ch of L.labels.children) {
      const t = ch as Text; if (!t.visible || t.alpha < 0.05 || !t.text) continue;
      const p = prio.get(t) ?? 3;
      if (p >= MINOR && zoomRel < 0.8) { t.visible = false; continue; }
      cand.push({ t, p });
    }
    cand.sort((a, b) => a.p - b.p);
    boxes.length = 0;
    const pad = 3 / Math.max(0.01, cam.scale); // ~3 screen px breathing room
    for (const { t } of cand) {
      const hw = Math.abs(t.width) / 2 + pad, hh = Math.abs(t.height) / 2 + pad * 0.5;
      const b = { x0: t.x - hw, y0: t.y - hh, x1: t.x + hw, y1: t.y + hh };
      if (boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) { t.visible = false; continue; }
      boxes.push(b);
    }
  }

  // ---------- picking ----------
  function pick(sx: number, sy: number): Target | null {
    const s = store.state; if (!s) return null;
    const w = cam.toWorld(sx, sy); const tol = 14 / cam.scale;
    const pm = store.mode.kind === "planet" ? store.mode.planetId : null;
    const shown = (id: string) => (unitViews.get(id)?.seen ?? -1) === frame;
    let best: Target | null = null, bestD = Infinity;
    let strict = true; // pass 1: exact hull hits only, so a planet under a docked mothership stays clickable
    const consider = (t: Target, x: number, y: number, r: number) => { const d = Math.hypot(w.x - x, w.y - y); if (d < (strict ? r * 0.55 : Math.max(r, tol)) && d - r * 0.3 < bestD) { bestD = d - r * 0.3; best = t; } };
    const units = () => {
      if (store.layerOn("enemies")) for (const e of s.enemies) { if (enemyHidden(e) || enemyViews.get(e.id)?.seen !== frame) continue; const v = enemyViews.get(e.id); consider({ kind: "enemy", id: e.id }, v?.x ?? e.pos.x, v?.y ?? e.pos.y, blockerR(e, cam.ui) * 1.2); }
      if (store.layerOn("units")) for (const u of s.units) { if (unitHidden(u) || !shown(u.id)) continue; const v = unitViews.get(u.id); consider({ kind: "unit", id: u.id }, v?.x ?? u.pos.x, v?.y ?? u.pos.y, unitSize(u) * 0.6); }
    };
    units(); if (best) return best;
    for (const p of s.planets) if (!p.hidden && !store.isHidden("planet", p.id) && (!pm || p.id === pm)) consider({ kind: "planet", id: p.id }, p.pos.x, p.pos.y, PLANET_R * planetK() * 1.8);
    if (best) return best;
    strict = false;
    if (store.layerOn("enemies")) for (const e of s.enemies) { if (enemyHidden(e) || enemyViews.get(e.id)?.seen !== frame) continue; const v = enemyViews.get(e.id); consider({ kind: "enemy", id: e.id }, v?.x ?? e.pos.x, v?.y ?? e.pos.y, blockerR(e, cam.ui) * 1.2); }
    if (store.layerOn("units")) for (const u of s.units) { if (unitHidden(u) || !shown(u.id)) continue; const v = unitViews.get(u.id); consider({ kind: "unit", id: u.id }, v?.x ?? u.pos.x, v?.y ?? u.pos.y, unitSize(u) * 0.6); }
    if (best) return best;
    if (store.layerOn("factories")) for (const f of s.factories) if (!f.hidden && !store.isHidden("factory", f.id, { planetId: f.planetId }) && (!pm || f.planetId === pm)) { const mp = moonPos.get(f.id); if (mp) consider({ kind: "factory", id: f.id }, mp.x, mp.y, 16 * cam.ui); }
    if (store.layerOn("mines")) for (const m of s.mines) { const c = minePos.get(m.id); if (c && mineViews.has(m.id)) consider({ kind: "mine", id: m.id }, c.x, c.y, 70); }
    if (store.layerOn("research") && s.research && !pm) consider({ kind: "research", id: "research" }, s.research.pos.x, s.research.pos.y, 40);
    if (best) return best;
    consider({ kind: "sun", id: "sun" }, 0, 0, SUN_R * (pm ? 0.55 : 1.1));
    for (const p of s.planets) if (!p.hidden && !store.isHidden("planet", p.id) && (!pm || p.id === pm)) consider({ kind: "planet", id: p.id }, p.pos.x, p.pos.y, PLANET_R * planetK() * 1.1);
    return best;
  }

  /** Planet view frame: the planet, its agents' task sites, and the blockers holding its agents. */
  function planetFrame(s: WorldState, pid: DeptId): { x: number; y: number; s: number } | null {
    const p = s.planets.find((q) => q.id === pid); if (!p) return null;
    const pts: { x: number; y: number }[] = [p.pos];
    const mine = s.units.filter((u) => u.planetId === pid && !u.hidden && u.status !== "dead");
    for (const u of mine) { pts.push(u.pos); if (u.role === "mothership" && u.status !== "idle" && u.status !== "done") pts.push(u.target); }
    const ids = new Set(mine.map((u) => u.id));
    // idle agents park on the night side of the planet
    const away = Math.atan2(p.pos.y, p.pos.x), pr = PLANET_R * planetK();
    pts.push({ x: p.pos.x + Math.cos(away) * pr * 2.6, y: p.pos.y + Math.sin(away) * pr * 2.6 });
    // blockers sit just beyond this team's frontier: keep them in frame; only a very far one merely pulls the frame toward it
    for (const e of s.enemies) if (!e.hidden && (e.planetIds.includes(pid) || e.blocked.some((id) => ids.has(id)))) {
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y), k = d > 1800 ? 0.5 : 1;
      pts.push({ x: p.pos.x + (e.pos.x - p.pos.x) * k, y: p.pos.y + (e.pos.y - p.pos.y) * k });
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const f = fitBox(x0, y0, x1, y1, 150);
    return { x: cx, y: cy, s: Math.min(f.s, 0.75) };
  }

  /** Box → camera: center + scale that fits it in the free band between the HUD bars (uses the full width). */
  function fitBox(x0: number, y0: number, x1: number, y1: number, pad: number) {
    const hw = (x1 - x0) / 2 + pad, hh = (y1 - y0) / 2 + pad;
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: cam.clamp(Math.min(cam.w / (2 * hw), cam.bandH / (2 * hh))) };
  }
  /** System view: everything that means something (sun, teams, their sites, blockers at the edge), framed tight. */
  function systemFrame(s: WorldState) {
    let x0 = -SUN_R * 2, y0 = -SUN_R * 2, x1 = SUN_R * 2, y1 = SUN_R * 2;
    const add = (x: number, y: number, r: number) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
    for (const p of s.planets) if (!p.hidden && !store.isHidden("planet", p.id)) add(p.pos.x, p.pos.y, PLANET_R * 1.8);
    for (const e of s.enemies) if (!enemyHidden(e)) add(e.pos.x, e.pos.y, 110); // glyph + its hover title stay clear of the bars
    for (const u of s.units) if (!unitHidden(u) && u.role === "mothership") add(u.target.x, u.target.y, 60);
    return fitBox(x0, y0, x1, y1, 30);
  }

  function flyToMode() {
    const s = store.state; const m = store.mode;
    measureInsets();
    if (!s) return;
    if (m.kind === "planet") { const f = planetFrame(s, m.planetId); if (f) cam.flyTo(f.x, f.y, f.s); }
    else if (m.kind === "system" || m.kind === "galaxy") { const f = systemFrame(s); cam.flyTo(f.x, f.y, f.s); }
    else if (m.kind === "memory") cam.flyTo(0, 0, cam.fitScale(420));
  }
  store.on("mode", () => { userMoved = false; flyToMode(); });
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
      } else if (down.moved) { userMoved = true; cam.panBy(p.x - last.x, p.y - last.y); cv.style.cursor = "grabbing"; }
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
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const p = rel(e); userMoved = true; cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
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
  window.addEventListener("resize", () => { measureInsets(); if (store.mode.kind === "system" && store.state) { const f = systemFrame(store.state); cam.flyTo(f.x, f.y, f.s, 0.2); } });
}
