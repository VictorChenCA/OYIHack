// S6 memory plugin: the enter-the-sun explorer's backend (SPEC §3.6).
// GET /api/memory/graph  → MemGraph (list_pages paged, structural + get_links edges, cached 30s)
// GET /api/memory/page   → { slug, title, content }
// GET /api/memory/search → { results: { slug, title, snippet }[] }
import type { Plugin, Ctx } from "../plugin";
import type { DeptId, MemEdge, MemGraph, MemNode } from "../../shared/types";
import { gbrainCall, type GBrainEndpoint } from "../gbrain-client";

const MAX_NODES = 2000;
const PAGE = 100;
const LINK_PAGES = 150;
const CACHE_MS = 30_000;
const MIN_PRODUCT_PAGES = 3; // below this the product brain is "empty" for demo purposes → dev brain

const DEPTS: Record<string, DeptId> = { engineering: "engineering", marketing: "marketing", "product-design": "product_design", product_design: "product_design", arts: "arts" };

interface PageRow { slug: string; title?: string; type?: string; updated_at?: string }

function json(v: unknown, status = 200) { return new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }

function endpoints(ctx: Ctx): { product: GBrainEndpoint; dev: GBrainEndpoint } {
  return {
    product: { url: ctx.env("GBRAIN_IO_URL") || ctx.cfg.gbrain.url, token: ctx.env(ctx.cfg.gbrain.tokenEnv) },
    dev: { url: ctx.cfg.gbrainDev.url, token: ctx.env(ctx.cfg.gbrainDev.tokenEnv) },
  };
}

export function planetOf(slug: string): DeptId | undefined {
  const m = /^company\/([^/]+)\//.exec(slug);
  return m ? DEPTS[m[1]] : undefined;
}

function rows(r: unknown): PageRow[] {
  const arr = Array.isArray(r) ? r : ((r as any)?.pages ?? (r as any)?.results ?? []);
  return (arr as any[]).filter((p) => p && typeof p.slug === "string");
}

async function listAll(ep: GBrainEndpoint, cap = MAX_NODES): Promise<PageRow[]> {
  const out: PageRow[] = []; const seen = new Set<string>();
  let after: string | undefined;
  for (let i = 0; i < Math.ceil(cap / PAGE) + 2 && out.length < cap; i++) {
    const args: Record<string, unknown> = { limit: PAGE, sort: "updated_asc" };
    if (after) args.updated_after = after;
    const batch = rows(await gbrainCall(ep, "list_pages", args));
    let added = 0;
    for (const p of batch) { if (!seen.has(p.slug)) { seen.add(p.slug); out.push(p); added++; } }
    if (batch.length < PAGE || added === 0) break;
    const last = batch[batch.length - 1].updated_at;
    if (!last || last === after) break;
    after = last;
  }
  return out.slice(0, cap);
}

function linkTargets(r: unknown): string[] {
  const arr = Array.isArray(r) ? r : ((r as any)?.links ?? (r as any)?.outgoing ?? (r as any)?.results ?? []);
  const out: string[] = [];
  for (const l of arr as any[]) {
    if (typeof l === "string") out.push(l);
    else if (l) { const t = l.to_slug ?? l.target_slug ?? l.to ?? l.target ?? l.slug; if (typeof t === "string") out.push(t); }
  }
  return out;
}

function buildGraph(pages: PageRow[]): MemGraph {
  const nodes: MemNode[] = []; const edges: MemEdge[] = [];
  const ids = new Set<string>();
  const add = (n: MemNode) => { if (!ids.has(n.id)) { ids.add(n.id); nodes.push(n); } };
  for (const p of pages) add({ id: p.slug, slug: p.slug, title: p.title || p.slug.split("/").pop() || p.slug, planetId: planetOf(p.slug), type: p.type, updatedAt: p.updated_at });
  // structural: each page → nearest existing ancestor; missing folders become synthetic "folder" nodes
  const folders = new Set<string>();
  for (const p of pages) {
    const parts = p.slug.split("/");
    for (let i = parts.length - 1; i >= 1; i--) {
      const child = parts.slice(0, i + 1).join("/"); const parent = parts.slice(0, i).join("/");
      if (!ids.has(parent)) {
        if (folders.has(parent)) { edges.push({ from: parent, to: child, kind: "structural" }); break; }
        folders.add(parent);
        add({ id: parent, slug: parent, title: parts[i - 1] + "/", planetId: planetOf(parent + "/"), type: "folder" });
        edges.push({ from: parent, to: child, kind: "structural" });
        continue; // keep climbing to connect the new folder
      }
      edges.push({ from: parent, to: child, kind: "structural" });
      break;
    }
  }
  return { nodes, edges };
}

const cache = new Map<string, { at: number; graph: MemGraph; brain: string }>();
const inflight = new Map<string, Promise<{ graph: MemGraph; brain: string }>>();

async function loadGraph(ctx: Ctx, force?: "product" | "dev"): Promise<{ graph: MemGraph; brain: string }> {
  const { product, dev } = endpoints(ctx);
  let brain: "product" | "dev" = force ?? "product";
  let pages: PageRow[] = [];
  if (brain === "product") {
    try { pages = await listAll(product); } catch (e) { console.warn("[memory] product brain list failed:", (e as Error).message); }
    if (pages.length < MIN_PRODUCT_PAGES && !force) {
      try { const d = await listAll(dev); if (d.length > pages.length) { pages = d; brain = "dev"; } } catch (e) { console.warn("[memory] dev brain list failed:", (e as Error).message); }
    }
  } else {
    pages = await listAll(dev);
  }
  const graph = buildGraph(pages);
  // real links for the most recent pages; bounded time budget
  const ep = brain === "product" ? product : dev;
  const recent = [...pages].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))).slice(0, LINK_PAGES);
  const ids = new Set(graph.nodes.map((n) => n.id));
  const seen = new Set<string>();
  const deadline = Date.now() + 6000;
  const queue = [...recent];
  const worker = async () => {
    while (queue.length && Date.now() < deadline) {
      const p = queue.shift()!;
      try {
        const t = linkTargets(await gbrainCall(ep, "get_links", { slug: p.slug }, 4000));
        for (const to of t) { const k = p.slug + ">" + to; if (to !== p.slug && ids.has(to) && !seen.has(k)) { seen.add(k); graph.edges.push({ from: p.slug, to, kind: "link" }); } }
      } catch { /* skip */ }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { graph, brain };
}

async function graphCached(ctx: Ctx, force?: "product" | "dev") {
  const key = force ?? "auto";
  const c = cache.get(key);
  if (c && Date.now() - c.at < CACHE_MS) return c;
  let p = inflight.get(key);
  if (!p) {
    p = loadGraph(ctx, force).then((r) => { cache.set(key, { at: Date.now(), ...r }); return r; }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  if (c) { p.catch(() => {}); return c; } // stale-while-revalidate: never block on a refresh
  const r = await p; return { at: Date.now(), ...r };
}

function pickBrain(url: URL, ctx: Ctx): GBrainEndpoint {
  const { product, dev } = endpoints(ctx);
  const b = url.searchParams.get("brain") ?? cache.get("auto")?.brain;
  return b === "dev" ? dev : product;
}

function contentOf(p: any): string {
  if (!p || typeof p !== "object") return typeof p === "string" ? p : "";
  let c = p.compiled_truth ?? p.content ?? p.body ?? p.markdown ?? "";
  if (typeof p.timeline === "string" && p.timeline.trim()) c += "\n\n## Timeline\n\n" + p.timeline;
  return String(c);
}

// ── live pulses (SPEC §3.6): hosted brains have no /admin/events, so poll list_pages updated_desc every 3s.
// New/updated pages → world.memoryEvent (sun pulse + node flash) and are patched into the cached graph at once.
const lastSeen = new Map<string, string>(); // brain → max updated_at seen
let polling = false;
async function pollChanges(ctx: Ctx) {
  if (polling) return; polling = true;
  try {
    const { product, dev } = endpoints(ctx);
    const brains: ["product" | "dev", GBrainEndpoint][] = [["product", product]];
    if (cache.get("auto")?.brain === "dev") brains.push(["dev", dev]);
    for (const [name, ep] of brains) {
      let recent: PageRow[] = [];
      try { recent = rows(await gbrainCall(ep, "list_pages", { limit: 10, sort: "updated_desc" }, 5000)); } catch { continue; }
      const prev = lastSeen.get(name);
      const max = recent.reduce((m, p) => (String(p.updated_at ?? "") > m ? String(p.updated_at) : m), prev ?? "");
      lastSeen.set(name, max);
      if (prev === undefined) continue; // first poll only primes the cursor
      const fresh = recent.filter((p) => String(p.updated_at ?? "") > prev).reverse();
      for (const p of fresh) {
        const at = Date.parse(p.updated_at ?? "") || Date.now();
        try { ctx.world?.memoryEvent({ at, op: "put_page", kind: "write", slug: p.slug, planetId: planetOf(p.slug) }); } catch {}
        for (const [key, c] of cache) {
          if (c.brain !== name) continue;
          if (!c.graph.nodes.some((n) => n.id === p.slug)) {
            const g = buildGraph([p]);
            const ids = new Set(c.graph.nodes.map((n) => n.id));
            for (const n of g.nodes) if (!ids.has(n.id)) c.graph.nodes.push(n);
            for (const e of g.edges) c.graph.edges.push(e);
            cache.set(key, c);
          }
        }
      }
    }
  } finally { polling = false; }
}

const plugin: Plugin = {
  name: "memory",
  init(ctx) {
    graphCached(ctx).catch((e) => console.warn("[memory] prewarm failed:", (e as Error).message));
    setInterval(() => { pollChanges(ctx).catch(() => {}); }, 3000);
  },
  routes: {
    "GET /api/memory/graph": async (_req, url, ctx) => {
      const b = url.searchParams.get("brain");
      try {
        const r = await graphCached(ctx, b === "dev" || b === "product" ? b : undefined);
        return json({ ...r.graph, brain: r.brain });
      } catch (e) { return json({ nodes: [], edges: [], error: (e as Error).message }, 502); }
    },
    "GET /api/memory/page": async (_req, url, ctx) => {
      const slug = url.searchParams.get("slug");
      if (!slug) return json({ error: "missing slug" }, 400);
      try {
        const p: any = await gbrainCall(pickBrain(url, ctx), "get_page", { slug, include_content: true });
        let content = contentOf(p);
        if (content.length > 60000) content = content.slice(0, 60000) + "\n\n…(truncated)";
        return json({ slug, title: p?.title ?? slug, content, type: p?.type });
      } catch (e) { return json({ slug, title: slug, content: "", error: (e as Error).message }, 502); }
    },
    "GET /api/memory/search": async (_req, url, ctx) => {
      const q = url.searchParams.get("q")?.trim();
      if (!q) return json({ results: [] });
      try {
        const r: any = await gbrainCall(pickBrain(url, ctx), "search", { query: q, limit: 20 });
        const arr: any[] = Array.isArray(r) ? r : (r?.results ?? []);
        const bySlug = new Map<string, { slug: string; title: string; snippet: string }>();
        for (const x of arr) {
          if (!x?.slug || bySlug.has(x.slug)) continue;
          const snippet = String(x.chunk_text ?? x.snippet ?? x.text ?? "").replace(/\s+/g, " ").slice(0, 220);
          bySlug.set(x.slug, { slug: x.slug, title: x.title ?? x.slug, snippet });
        }
        return json({ results: [...bySlug.values()] });
      } catch (e) { return json({ results: [], error: (e as Error).message }, 502); }
    },
  },
};

export default plugin;
