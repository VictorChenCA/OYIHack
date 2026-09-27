// S3 Brains: blocker classification. River Sentinel sidecar first (3s timeout), Haiku fallback, rules for simulated.
// Also improves enemy title/reason and merges enemies whose canonical causeKey matches (Haiku path).
import type { Classification, DeptId, Enemy, EnemyKind, Quadrant, Tier } from "../shared/types";
import type { Ctx } from "./plugin";
import { claudeJson } from "./llm";

const KINDS: EnemyKind[] = ["credential", "account", "approval", "rate_limit", "billing", "missing_info", "dependency", "failure"];
const QUADS: Quadrant[] = ["do_now", "schedule", "delegate", "drop"];
const DEPTS: DeptId[] = ["engineering", "marketing", "product_design", "arts"];
const TIERS: Tier[] = ["haiku", "sonnet", "opus", "fable"];
const pick = <T extends string>(v: any, allowed: T[], dflt: T): T => (allowed.includes(v) ? v : dflt);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** ruleCauseKey → canonical causeKey chosen by the LLM (so re-created duplicates merge without another call). */
const canonical = new Map<string, string>();
const canonOf = new Map<string, string>(); // enemyId → canonical key
const inflight = new Set<string>();

export function blockerText(e: Enemy, ctx: Ctx): string {
  const parts = [`${e.title}. ${e.reason}`, `kind guess: ${e.kind}`];
  for (const id of e.blocked.slice(0, 3)) {
    const u = ctx.world.units.get(id); if (!u) continue;
    const bits = [`unit ${u.label} on ${u.planetId}`];
    if (u.task) bits.push(`task: ${clip(u.task, 120)}`);
    if (u.lastTool) bits.push(`last tool: ${u.lastTool}(${clip(u.lastToolInput ?? "", 100)})`);
    if (u.summary) bits.push(`summary: ${clip(u.summary, 160)}`);
    parts.push(bits.join("; "));
  }
  return parts.join("\n");
}

export function defaultTier(kind: EnemyKind, text: string): Tier {
  if (kind === "rate_limit" || kind === "approval" || kind === "missing_info") return "haiku";
  if (kind === "failure") return /architect|design|refactor|migrat/i.test(text) ? "opus" : "sonnet";
  if (kind === "dependency") return "sonnet";
  return "sonnet";
}

export function deptGuess(e: Enemy, text: string): DeptId {
  if (/\b(logo|brand|image|video|illustrat|art)\b/i.test(text)) return "arts";
  if (/\b(post|launch|outreach|tiktok|instagram|twitter|x\.com|linkedin|campaign|newsletter)\b/i.test(text)) return "marketing";
  if (/\b(ux|landing page|figma|flow|wireframe|design)\b/i.test(text)) return "product_design";
  return e.planetIds[0] ?? "engineering";
}

export function rulesClassification(e: Enemy, ctx: Ctx): Classification {
  const text = blockerText(e, ctx);
  return {
    kind: { label: e.kind, p: 0.6 }, quadrant: { label: e.quadrant, p: 0.6 }, humanOnly: { label: e.humanOnly, p: 0.6 },
    department: { label: deptGuess(e, text), p: 0.5 }, tier: { label: defaultTier(e.kind, text), p: 0.5 }, source: "rules",
  };
}

type Engine = Ctx["world"]["research"]["engine"];
export async function sentinel(ctx: Ctx, items: { id: string; text: string }[], engine: Engine): Promise<Map<string, Classification> | null> {
  const q = engine === "sentinel-base" ? "?engine=base" : engine === "fast" ? "?engine=fast" : "";
  const t0 = Date.now();
  try {
    const res = await fetch(`${ctx.cfg.sentinelUrl}/classify${q}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }), signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j: any = await res.json();
    ctx.world.research.sidecarUp = true;
    const out = new Map<string, Classification>();
    const source: Classification["source"] = engine === "sentinel-base" ? "sentinel-base" : engine === "fast" ? "fast" : "sentinel";
    for (const r of j?.results ?? []) {
      const f = r?.fields ?? {};
      const sc = <T extends string>(x: any, allowed: T[], d: T) => ({ label: pick(x?.label, allowed, d), p: Number(x?.p ?? 0.5), dist: x?.dist });
      out.set(r.id, {
        kind: sc(f.kind, KINDS, "failure"), quadrant: sc(f.quadrant, QUADS, "schedule"),
        humanOnly: { label: String(f.human_only?.label ?? "no").toLowerCase() === "yes", p: Number(f.human_only?.p ?? 0.5), dist: f.human_only?.dist },
        department: sc(f.department, DEPTS, "engineering"), tier: sc(f.tier, TIERS, "sonnet"),
        source, latencyMs: Number(r.latency_ms ?? Date.now() - t0),
      });
    }
    return out;
  } catch {
    ctx.world.research.sidecarUp = false;
    return null;
  }
}

const POLICY = `Triage policy:
- Phone number, CAPTCHA, payment, signing terms, legal identity, or entering a secret -> humanOnly=true.
- Signups on X, TikTok, Instagram or LinkedIn -> kind account, humanOnly=true.
- Missing API key or token -> credential, do_now, humanOnly=true.
- billing_error / credits exhausted -> billing, do_now, humanOnly=true.
- rate_limit / overloaded -> rate_limit, delegate, humanOnly=false, tier haiku.
- Permission prompts for read-only commands -> approval, delegate. Destructive or external-facing (push, deploy, post, delete) -> approval, schedule, humanOnly=true.
- Waiting on another department's output -> dependency, schedule; department = the one being waited on.
- "Waiting for your input" with nothing specific -> missing_info, drop (do_now if a deadline is mentioned).
- Failing tests or build errors -> failure, engineering, tier sonnet (opus if architectural).
- Departments: code/PRs/CI -> engineering; posts/launch/outreach -> marketing; UX/landing page/flows -> product_design; logo/brand/images/video -> arts.
- Tier: trivial/lookup -> haiku; routine implementation/writing -> sonnet; complex multi-file/strategy -> opus; hardest long-horizon -> fable.`;

async function haikuClassify(e: Enemy, ctx: Ctx, live: Enemy[]): Promise<{ cls: Classification; title?: string; reason?: string; causeKey?: string } | null> {
  const others = live.filter((x) => x.id !== e.id).slice(0, 12).map((x) => `- ${canonOf.get(x.id) ?? x.causeKey}: ${x.title}`).join("\n") || "(none)";
  const prompt = `Classify this blocker for an AI-agent command center. ${POLICY}

Blocker:
${blockerText(e, ctx)}

Other live blockers (canonical causeKey: title):
${others}

Reply with ONLY strict JSON:
{"kind":"credential|account|approval|rate_limit|billing|missing_info|dependency|failure","quadrant":"do_now|schedule|delegate|drop","humanOnly":true|false,"department":"engineering|marketing|product_design|arts","tier":"haiku|sonnet|opus|fable","title":"<=5 words, e.g. Needs GITHUB_TOKEN","reason":"<=15 words why units are blocked","causeKey":"kind:short-canonical-cause (reuse an existing key above if it is the SAME root cause)","confidence":0.0-1.0}`;
  const t0 = Date.now();
  const j: any = await claudeJson(prompt, { model: "haiku", timeoutMs: 30_000 });
  if (!j) return null;
  const p = Math.max(0.05, Math.min(1, Number(j.confidence ?? 0.7) || 0.7));
  const kind = pick(j.kind, KINDS, e.kind);
  return {
    cls: {
      kind: { label: kind, p }, quadrant: { label: pick(j.quadrant, QUADS, e.quadrant), p },
      humanOnly: { label: typeof j.humanOnly === "boolean" ? j.humanOnly : String(j.humanOnly) === "true" ? true : e.humanOnly, p },
      department: { label: pick(j.department, DEPTS, e.planetIds[0] ?? "engineering"), p }, tier: { label: pick(j.tier, TIERS, defaultTier(kind, "")), p },
      source: "haiku", latencyMs: Date.now() - t0,
    },
    title: typeof j.title === "string" && j.title.trim() ? clip(j.title.trim(), 40) : undefined,
    reason: typeof j.reason === "string" && j.reason.trim() ? clip(j.reason.trim(), 140) : undefined,
    causeKey: typeof j.causeKey === "string" && j.causeKey.trim() ? j.causeKey.trim().toLowerCase().slice(0, 80) : undefined,
  };
}

/** Move every blocked unit / attacker of `dup` onto `into`, delete `dup`. */
export function mergeEnemies(ctx: Ctx, dup: Enemy, into: Enemy) {
  if (dup.id === into.id) return;
  for (const id of dup.blocked) {
    const u = ctx.world.units.get(id); if (!u) continue;
    u.blockedBy = into.id; if (!into.blocked.includes(id)) into.blocked.push(id);
    if (!into.planetIds.includes(u.planetId)) into.planetIds.push(u.planetId);
  }
  for (const id of dup.attackers) { const u = ctx.world.units.get(id); if (u) { u.attacking = into.id; if (!into.attackers.includes(id)) into.attackers.push(id); } }
  into.pendingPermission ||= dup.pendingPermission;
  dup.blocked = []; dup.attackers = [];
  ctx.world.enemies.delete(dup.id);
  canonOf.delete(dup.id);
  ctx.world.log(`⇄ Merged “${dup.title}” into “${into.title}” (${into.blocked.length} blocked)`, { enemyId: into.id });
}

export async function classifyEnemy(e: Enemy, ctx: Ctx): Promise<void> {
  if (inflight.has(e.id)) return;
  inflight.add(e.id);
  try {
    // fast merge: a rule causeKey we already canonicalized onto a live enemy
    const canon = canonical.get(e.causeKey);
    if (canon) {
      const target = [...ctx.world.enemies.values()].find((x) => x.id !== e.id && !x.resolved && canonOf.get(x.id) === canon);
      if (target) { mergeEnemies(ctx, e, target); return; }
    }
    const engine = ctx.world.research.engine;
    if (engine !== "haiku") {
      const r = await sentinel(ctx, [{ id: e.id, text: blockerText(e, ctx) }], engine);
      const cls = r?.get(e.id);
      if (cls && ctx.world.enemies.has(e.id)) {
        ctx.world.applyClassification(e.id, cls);
        ctx.world.log(`◎ Sentinel: “${e.title}” → ${cls.kind.label}/${cls.quadrant.label}${cls.humanOnly.label ? " ★" : ""} (${cls.latencyMs ?? "?"}ms)`, { enemyId: e.id });
        if (!e.simulated) void refineText(e, ctx); // Sentinel labels; Haiku still writes a better title + merge key for real blockers
        return;
      }
    }
    if (e.simulated) { if (ctx.world.enemies.has(e.id)) ctx.world.applyClassification(e.id, rulesClassification(e, ctx)); return; }
    await haikuPath(e, ctx, true);
  } finally { inflight.delete(e.id); }
}

async function haikuPath(e: Enemy, ctx: Ctx, applyCls: boolean) {
  const live = [...ctx.world.enemies.values()].filter((x) => !x.resolved);
  const r = await haikuClassify(e, ctx, live);
  if (!ctx.world.enemies.has(e.id)) return;
  if (!r) { if (applyCls && !e.classification) ctx.world.applyClassification(e.id, rulesClassification(e, ctx)); return; }
  if (applyCls) ctx.world.applyClassification(e.id, r.cls);
  if (r.title) e.title = r.title;
  if (r.reason) e.reason = r.reason;
  if (r.causeKey) {
    canonical.set(e.causeKey, r.causeKey);
    const target = [...ctx.world.enemies.values()].find((x) => x.id !== e.id && !x.resolved && (canonOf.get(x.id) === r.causeKey || x.causeKey === r.causeKey));
    if (target) { mergeEnemies(ctx, e, target); return; }
    canonOf.set(e.id, r.causeKey);
  }
  if (applyCls) ctx.world.log(`◎ Haiku: “${e.title}” → ${r.cls.kind.label}/${r.cls.quadrant.label}${r.cls.humanOnly.label ? " ★ human-only" : ""}`, { enemyId: e.id });
}

function refineText(e: Enemy, ctx: Ctx) { return haikuPath(e, ctx, false).catch(() => {}); }

/** Track new enemies (call from onTick). */
const seen = new Set<string>();
export function detectNewEnemies(ctx: Ctx) {
  for (const e of ctx.world.enemies.values()) {
    if (seen.has(e.id) || e.resolved) continue;
    seen.add(e.id);
    void classifyEnemy(e, ctx).catch((err) => console.warn(`[brains] classify: ${err?.message ?? err}`));
  }
  if (seen.size > 2000) for (const id of [...seen]) if (!ctx.world.enemies.has(id)) seen.delete(id);
}

/** Re-run classification for every live enemy (e.g. after the research engine changes). */
export function reclassifyAll(ctx: Ctx) {
  for (const e of ctx.world.enemies.values()) if (!e.resolved) void classifyEnemy(e, ctx).catch(() => {});
}
