// S4: GBrain stateless MCP over HTTP — per-department page counts and "someone wrote memory" pulses.
import type { DeptId } from "../shared/types";
import type { Ctx } from "./plugin";

export async function mcpCall(url: string, token: string | undefined, name: string, args: Record<string, unknown>, timeoutMs = 15_000): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const body = await res.text();
  let msg: any;
  const data = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
  if (data.length) msg = JSON.parse(data[data.length - 1]); else msg = JSON.parse(body);
  if (msg.error) throw new Error(`${name}: ${msg.error.message ?? "error"}`);
  const text = msg.result?.content?.[0]?.text;
  if (msg.result?.isError) throw new Error(`${name}: ${String(text ?? "tool error").slice(0, 160)}`);
  try { return JSON.parse(text); } catch { return text; }
}

export function deptOf(slug: string): DeptId | undefined {
  const m = slug.match(/^company\/([\w-]+)/i); if (!m) return undefined;
  const d = m[1].toLowerCase();
  if (d.startsWith("eng")) return "engineering";
  if (d.startsWith("market")) return "marketing";
  if (d.startsWith("product") || d === "design") return "product_design";
  if (d.startsWith("art") || d === "brand") return "arts";
  return undefined;
}

const pagesOf = (r: any): any[] => (Array.isArray(r) ? r : r?.pages ?? r?.results ?? r?.items ?? []);
const updatedOf = (p: any): string => String(p?.updated_at ?? p?.updatedAt ?? p?.updated ?? "");

interface Brain { url: string; token?: string; label: string }
let active: Brain | undefined;
let lastErr = "";

async function brainCall(ctx: Ctx, name: string, args: Record<string, unknown>) {
  const prod: Brain = { url: ctx.cfg.gbrain.url, token: ctx.env(ctx.cfg.gbrain.tokenEnv), label: "product" };
  const dev: Brain = { url: ctx.cfg.gbrainDev.url, token: ctx.env(ctx.cfg.gbrainDev.tokenEnv), label: "dev" };
  const order = active?.label === "dev" ? [dev, prod] : [prod, dev];
  let err: any;
  for (const b of order) {
    if (b.label === "product" && !b.token) { err = new Error("no product brain token"); continue; }
    try { const r = await mcpCall(b.url, b.token, name, args); if (active?.label !== b.label) { active = b; console.log(`[ops] gbrain: using ${b.label} brain`); } return r; }
    catch (e) { err = e; }
  }
  throw err;
}

let counting = false, polling = false, lastCount = 0, lastPoll = 0;
let lastSeen = ""; // ISO updated_at high-water mark for write pulses

export async function countPages(ctx: Ctx) {
  if (counting) return; counting = true; lastCount = Date.now();
  try {
    const counts: Record<DeptId, number> = { engineering: 0, marketing: 0, product_design: 0, arts: 0 };
    let total = 0;
    for (let offset = 0; offset < 3000; offset += 100) {
      const pages = pagesOf(await brainCall(ctx, "list_pages", { limit: 100, offset, sort: "updated_asc" }));
      for (const p of pages) { total++; const d = deptOf(String(p.slug ?? "")); if (d) counts[d]++; }
      if (pages.length < 100) break;
    }
    for (const [d, n] of Object.entries(counts)) ctx.world.setPlanetKnowledge(d as DeptId, n);
    ctx.world.knowledge.pages = total;
    lastErr = "";
  } catch (e: any) {
    const m = String(e?.message ?? e); if (m !== lastErr) { lastErr = m; console.warn(`[ops] gbrain counts unavailable: ${m}`); }
  } finally { counting = false; }
}

export async function pollWrites(ctx: Ctx) {
  if (polling) return; polling = true; lastPoll = Date.now();
  try {
    const pages = pagesOf(await brainCall(ctx, "list_pages", { sort: "updated_desc", limit: 10 }));
    const newest = pages.map(updatedOf).filter(Boolean).sort().pop() ?? "";
    if (!lastSeen) { lastSeen = newest || new Date().toISOString(); return; }
    const fresh = pages.filter((p) => updatedOf(p) > lastSeen);
    for (const p of fresh.reverse()) {
      const slug = String(p.slug ?? "");
      const viaHook = ctx.world.knowledge.recent.some((r) => r.kind === "write" && r.slug === slug && Date.now() - r.at < 120_000);
      if (!viaHook) ctx.world.memoryEvent({ at: Date.now(), op: "put_page", kind: "write", slug, planetId: deptOf(slug) });
    }
    if (newest > lastSeen) lastSeen = newest;
  } catch {} finally { polling = false; }
}

export function gbrainTick(ctx: Ctx, now = Date.now()) {
  if (now - lastCount > 30_000) void countPages(ctx);
  if (now - lastPoll > 5_000) void pollWrites(ctx);
}
