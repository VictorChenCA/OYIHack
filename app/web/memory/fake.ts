// Offline demo graph for ?fixture (~300 nodes), same MemGraph shape as /api/memory/graph.
import type { DeptId, MemEdge, MemGraph, MemNode } from "../../shared/types";

const DEPT_SLUG: Record<DeptId, string> = { engineering: "engineering", marketing: "marketing", product_design: "product-design", arts: "arts" };
const TOPICS: Record<DeptId, string[]> = {
  engineering: ["api", "infra", "hooks", "transport", "gbrain", "river", "superset", "postmortems", "runbooks", "decisions"],
  marketing: ["launch", "campaigns", "copy", "channels", "personas"],
  product_design: ["flows", "research", "components", "specs"],
  arts: ["brand", "moodboards", "icons"],
};
const WORDS = ["websocket", "retry", "latency", "sentinel", "classifier", "tether", "orbit", "fog", "veteran", "budget", "token", "cache", "schema", "planet", "swarm", "hotkeys", "minimap", "beam", "colony", "enemy", "rate-limit", "oauth", "deploy", "rollback", "eval", "checkpoint", "prompt", "preamble", "hero", "palette", "tagline", "demo", "pitch", "timeline", "audit", "index", "graph", "search", "vector", "chunk"];
const REF = { people: ["victor-chen", "garry-tan", "river-team", "superset-team"], sponsors: ["river-ai", "gbrain", "memorable", "qm", "superset", "ufo"], concepts: ["eisenhower-matrix", "rts-controls", "fog-of-war", "control-groups", "knowledge-graph", "procedural-memory"] };

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const title = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function fakeGraph(): MemGraph {
  const r = rng(42);
  const nodes: MemNode[] = []; const edges: MemEdge[] = []; const ids = new Set<string>();
  const now = Date.now();
  const add = (slug: string, type = "note", planetId?: DeptId) => { if (ids.has(slug)) return; ids.add(slug); nodes.push({ id: slug, slug, title: type === "folder" ? slug.split("/").pop() + "/" : title(slug.split("/").pop()!), planetId, type, updatedAt: new Date(now - r() * 86400000).toISOString() }); };
  const weight: Record<DeptId, number> = { engineering: 110, marketing: 45, product_design: 38, arts: 27 };
  add("company", "folder");
  for (const d of Object.keys(DEPT_SLUG) as DeptId[]) {
    const root = `company/${DEPT_SLUG[d]}`; add(root, "folder", d); edges.push({ from: "company", to: root, kind: "structural" });
    const topics = TOPICS[d];
    for (const t of topics) { const f = `${root}/${t}`; add(f, "folder", d); edges.push({ from: root, to: f, kind: "structural" }); }
    for (let i = 0; i < weight[d]; i++) {
      const t = topics[Math.floor(r() * topics.length)];
      const slug = `${root}/${t}/${WORDS[Math.floor(r() * WORDS.length)]}-${WORDS[Math.floor(r() * WORDS.length)]}`;
      if (ids.has(slug)) continue;
      add(slug, "note", d); edges.push({ from: `${root}/${t}`, to: slug, kind: "structural" });
    }
  }
  for (const [ns, list] of Object.entries(REF)) { add(ns, "folder"); for (const s of list) { add(`${ns}/${s}`, ns === "people" ? "person" : "concept"); edges.push({ from: ns, to: `${ns}/${s}`, kind: "structural" }); } }
  const leaves = nodes.filter((n) => n.type !== "folder");
  for (let i = 0; i < 140; i++) {
    const a = leaves[Math.floor(r() * leaves.length)], b = r() < 0.35 ? leaves.filter((n) => !n.planetId)[Math.floor(r() * 16)] : leaves[Math.floor(r() * leaves.length)];
    if (a && b && a !== b) edges.push({ from: a.id, to: b.id, kind: "link" });
  }
  return { nodes, edges };
}

export function fakePage(slug: string, t: string) {
  const parts = slug.split("/");
  return `# ${t}\n\n**Namespace:** \`${parts.slice(0, -1).join("/") || "/"}\`  \n**Compiled truth** from the swarm's last run.\n\n## What we learned\n\n- The **${parts[parts.length - 1]}** path is charted: median ETA 4m 12s across 6 runs.\n- Agents recall this page on spawn via the GBrain preamble.\n- Related: [[company/engineering/runbooks]] and [[concepts/knowledge-graph]].\n\n## Procedure\n\n\`\`\`bash\nbun run dev:web\ncurl -s localhost:7777/api/memory/graph | jq '.nodes | length'\n\`\`\`\n\n### Open questions\n\n1. Should the sentinel auto-attack credential blockers?\n2. Does \`list_pages\` paging hold at 2000 nodes?\n\nSee [the spec](https://example.com/spec) for context.`;
}
