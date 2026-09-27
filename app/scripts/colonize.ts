// Colonization round (PLAN §3): one real mothership per planet, launched through C&C's own spawn command
// (S4 routes it to Superset). Each mothership fans out subagents, recalls from GBrain first and remembers findings.
//
// Usage (from app/):
//   bun scripts/colonize.ts                      # launch all 4 planets
//   bun scripts/colonize.ts --dry-run            # print the commands, send nothing
//   bun scripts/colonize.ts --planet marketing   # just one planet
//   bun scripts/colonize.ts --url http://localhost:7793 --tier opus --mode acceptEdits
import type { Command, CommandResult, DeptId, PermissionMode, Tier } from "../shared/types";

type SpawnCmd = Extract<Command, { type: "spawn" }>;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const URL_ = opt("url") ?? process.env.CC_URL ?? "http://localhost:7777";
const DRY = flag("dry-run");
const ONLY = opt("planet");
const TIER = (opt("tier") ?? "sonnet") as Tier;
const MODE = (opt("mode") ?? "auto") as PermissionMode;

/** Shared tail for every mothership: fan out, recall first, remember at the end, surface blockers precisely. */
const tail = (dept: string, slugDir: string) => "\n" + [
  "",
  "How to work:",
  "- Fan out: split the job into 2–4 parallel subagents (Task tool) and merge their results yourself.",
  `- Before starting, recall anything relevant from GBrain (the gbrain MCP: recall / search) for ${dept}.`,
  `- When done, remember the key findings in GBrain under ${slugDir} (one page per deliverable; short, factual).`,
  "- If you are blocked on something only a human can provide (an account, a token, an approval), stop and say exactly what is needed, in one line, naming the account/key.",
  "- Never commit secrets. Do not push. Keep every file you write inside the repo paths named above.",
].join("\n");

const PLANETS: { planetId: DeptId; projectId: string; name: string; prompt: string }[] = [
  {
    planetId: "engineering", projectId: "gbrain-triage", name: "eng-gbrain-triage",
    prompt: "Triage GBrain's 10 oldest open PRs (read-only; use `gh pr list -R garrytan/gbrain --state open`): for each, a verdict, risk and next step; " +
      "remember a summary page per PR in GBrain under company/engineering/pr-triage/. Also write the table to company/engineering/pr-triage.md." +
      tail("Engineering", "company/engineering/pr-triage/"),
  },
  {
    planetId: "marketing", projectId: "launch", name: "mkt-launch",
    prompt: "Draft the C&C launch thread for X, a Show HN post, and a 30s TikTok script into company/marketing/; " +
      "if posting requires an account, stop and say exactly what's needed." +
      tail("Marketing", "company/marketing/"),
  },
  {
    planetId: "product_design", projectId: "site", name: "pd-site",
    prompt: "Build the C&C landing page as a single static HTML file in company/design/site/index.html and a 90s demo storyboard in company/design/storyboard.md." +
      tail("Product Design", "company/product-design/"),
  },
  {
    planetId: "marketing", projectId: "brand", name: "mkt-brand",
    prompt: "Create the C&C logo (SVG), a palette (JSON + preview SVG) and an OG image SVG in company/marketing/brand/." +
      tail("Marketing", "company/marketing/brand/"),
  },
];

const picked = PLANETS.filter((p) => !ONLY || p.planetId === ONLY || p.projectId === ONLY || p.name === ONLY);
if (!picked.length) {
  console.error(`No planet matches "${ONLY}". Use one of: ${PLANETS.map((p) => p.planetId).join(", ")}`);
  process.exit(1);
}

const cmds: SpawnCmd[] = picked.map((p) => ({ type: "spawn", planetId: p.planetId, projectId: p.projectId, name: p.name, prompt: p.prompt, tier: TIER, permissionMode: MODE }));

console.log(`C&C colonization round → ${URL_}/api/command · ${cmds.length} mothership(s) · tier=${TIER} · mode=${MODE}${DRY ? " · DRY RUN" : ""}\n`);

let failed = 0;
for (const c of cmds) {
  if (DRY) { console.log(JSON.stringify(c, null, 2), "\n"); continue; }
  try {
    const res = await fetch(`${URL_}/api/command`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
    const r = (await res.json()) as CommandResult;
    console.log(`${r.ok ? "✓" : "✗"} ${c.planetId.padEnd(15)} ${c.name.padEnd(20)} ${r.message || (r.ok ? "launched" : "failed")}`);
    if (!r.ok) failed++;
  } catch (e: any) {
    failed++;
    console.log(`✗ ${c.planetId.padEnd(15)} ${c.name.padEnd(20)} server unreachable (${e?.message ?? e}). Is \`bun run dev\` running?`);
  }
  await Bun.sleep(600); // stagger so workspaces don't race
}
if (!DRY) console.log(failed ? `\n${failed} launch(es) failed.` : "\nAll motherships launched. Watch them arrive on the map.");
process.exit(failed ? 1 : 0);
