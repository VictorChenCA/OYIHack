// Run the GBrain `sprint-retro` skill headlessly (Claude Code on the user's subscription; no API key) for one or all departments.
// It reads the department's GBrain pages + C&C's open blockers, writes the retro page to GBrain and to company/<folder>/retros/<date>.md,
// and remembers 3 facts. Each run is itself a C&C unit (the repo's HTTP hooks report it to the map).
//
// Usage (from app/):
//   bun scripts/retro.ts --dept marketing            # one department
//   bun scripts/retro.ts                             # all four, in parallel
//   bun scripts/retro.ts --dept arts --dry-run       # print the prompt and command only
//   bun scripts/retro.ts --url http://localhost:7793 --model sonnet
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeptId, WorldState } from "../shared/types";

const APP = resolve(import.meta.dir, "..");
const REPO = resolve(APP, "..");
const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const URL_ = opt("url") ?? process.env.CC_URL ?? "http://localhost:7777";
const MODEL = opt("model") ?? "sonnet";
const DRY = args.includes("--dry-run");

// brain slug namespace vs repo folder per planet
const DEPTS: Record<DeptId, { slug: string; folder: string; name: string }> = {
  engineering: { slug: "engineering", folder: "engineering", name: "Engineering" },
  marketing: { slug: "marketing", folder: "marketing", name: "Marketing" },
  product_design: { slug: "product-design", folder: "design", name: "Product Design" },
  arts: { slug: "arts", folder: "arts", name: "Arts" },
};
const want = opt("dept");
const ids = (Object.keys(DEPTS) as DeptId[]).filter((d) => !want || d === want || DEPTS[d].slug === want || DEPTS[d].folder === want);
if (!ids.length) { console.error(`Unknown --dept ${want}. Use: ${Object.keys(DEPTS).join(", ")}`); process.exit(1); }

const skill = readFileSync(resolve(APP, "gbrain-skills/sprint-retro/SKILL.md"), "utf8");
let state: WorldState | null = null;
try { const r = await fetch(`${URL_}/api/state`, { signal: AbortSignal.timeout(3000) }); if (r.ok) state = (await r.json()) as WorldState; } catch {}
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD

function prompt(d: DeptId): string {
  const { slug, folder, name } = DEPTS[d];
  const planet = state?.planets.find((p) => p.id === d);
  const blockers = (state?.enemies ?? []).filter((e) => !e.resolved && e.planetIds.includes(d))
    .map((e) => ({ id: e.id, title: e.title, reason: e.reason, kind: e.kind, quadrant: e.quadrant, humanOnly: e.humanOnly, blockedUnits: e.blocked.length }));
  const since = planet ? new Date(planet.cycle.startAt).toISOString() : new Date(Date.now() - 7 * 86_400_000).toISOString();
  return [
    `Run the GBrain skill below, exactly as written, for the ${name} department.`,
    `Use the gbrain-cloud MCP tools (mcp__gbrain-cloud__*) for every brain read and write.`,
    "",
    `Inputs:`,
    `- department slug: ${slug} (brain namespace company/${slug}/)`,
    `- cycle: ${planet?.cycle.label ?? "last 7 days"}; since=${since}; until=${new Date().toISOString()}`,
    `- retro page slug: company/${slug}/retros/${today}`,
    `- also write the same markdown to the repo file: company/${folder}/retros/${today}.md`,
    `- open_blockers (from the C&C map, use verbatim): ${JSON.stringify(blockers)}`,
    `- repo deliverables for this department may also be in company/${folder}/ (read them as sources too; cite them as repo:<path>)`,
    "",
    `When done, reply with the retro slug, the 3 remembered facts, and the counts. Do not ask questions; do not push or commit.`,
    "",
    "----- SKILL.md -----",
    skill,
  ].join("\n");
}

const run = async (d: DeptId) => {
  const cmd = ["claude", "-p", prompt(d), "--model", MODEL, "--permission-mode", "acceptEdits",
    "--allowedTools", "mcp__gbrain-cloud__*", "Read", "Write", "Edit", "Glob", "Grep", "--output-format", "text"];
  if (DRY) { console.log(`# ${d}\n$ (cd ${REPO} && claude -p "<prompt below>" ${cmd.slice(3).map((c) => (c.includes("*") ? `"${c}"` : c)).join(" ")})\n\n${prompt(d)}\n`); return 0; }
  console.log(`▶ sprint-retro ${DEPTS[d].name} (headless Claude, ${MODEL})…`);
  const p = Bun.spawn(cmd, { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  console.log(`\n${code === 0 ? "✓" : "✗"} ${DEPTS[d].name} → company/${DEPTS[d].folder}/retros/${today}.md\n${(code === 0 ? out : err || out).trim()}\n`);
  return code;
};
const codes = await Promise.all(ids.map(run));
process.exit(codes.some((c) => c !== 0) ? 1 : 0);
