// Camera: world center (x,y) shown at screen center, uniform scale. Smooth fly-to animations.
import type { Application, Container } from "pixi.js";

export class Camera {
  x = 0; y = 0; scale = 0.3;
  minScale = 0.08; maxScale = 3;
  private anim: { fx: number; fy: number; fs: number; tx: number; ty: number; ts: number; t: number; dur: number } | null = null;
  constructor(private app: Application, private world: Container) {}

  /** Screen px covered by HUD chrome (top bar / bottom console): the camera centers on the free band between them. */
  insetTop = 0; insetBottom = 0;
  get w() { return this.app.screen.width; }
  get h() { return this.app.screen.height; }
  /** Screen y of the camera center: middle of the unobstructed band. */
  get cy() { return (this.h + this.insetTop - this.insetBottom) / 2; }
  /** Height of the unobstructed band. */
  get bandH() { return Math.max(120, this.h - this.insetTop - this.insetBottom); }
  /** Screen-size compensation: things drawn in world units stay readable at every zoom. */
  get ui() { return 1 / Math.pow(this.scale, 0.75); }

  toWorld(sx: number, sy: number) { return { x: (sx - this.w / 2) / this.scale + this.x, y: (sy - this.cy) / this.scale + this.y }; }
  toScreen(wx: number, wy: number) { return { x: (wx - this.x) * this.scale + this.w / 2, y: (wy - this.y) * this.scale + this.cy }; }

  fitScale(radius: number) { return Math.min(this.w, this.bandH) / (2 * radius); }

  flyTo(x: number, y: number, scale: number, dur = 0.7) {
    this.anim = { fx: this.x, fy: this.y, fs: this.scale, tx: x, ty: y, ts: this.clamp(scale), t: 0, dur };
  }
  stop() { this.anim = null; }
  clamp(s: number) { return Math.max(this.minScale, Math.min(this.maxScale, s)); }

  zoomAt(sx: number, sy: number, factor: number) {
    this.anim = null;
    const before = this.toWorld(sx, sy);
    this.scale = this.clamp(this.scale * factor);
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x; this.y += before.y - after.y;
  }
  panBy(dsx: number, dsy: number) { this.anim = null; this.x -= dsx / this.scale; this.y -= dsy / this.scale; }

  update(dt: number) {
    const a = this.anim;
    if (a) {
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.t < 0.5 ? 4 * a.t * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 3) / 2; // easeInOutCubic
      this.x = a.fx + (a.tx - a.fx) * e; this.y = a.fy + (a.ty - a.fy) * e;
      this.scale = Math.exp(Math.log(a.fs) + (Math.log(a.ts) - Math.log(a.fs)) * e);
      if (a.t >= 1) this.anim = null;
    }
    this.world.scale.set(this.scale);
    this.world.position.set(this.w / 2 - this.x * this.scale, this.cy - this.y * this.scale);
  }
}
