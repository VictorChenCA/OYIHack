# GBrain skills for C&C

| Skill | What it does |
|---|---|
| [`sprint-retro`](sprint-retro/SKILL.md) | End-of-cycle digest for one department: reads the cycle's `company/<dept>/` pages and open blockers, writes `company/<dept>/retros/<date>` (shipped, blocked, learned, next), and remembers 3 facts. |

Built for the GBrain side quest: *"solve tedious human problems with a new skill."* The tedious problem is the
Friday "what did we even do this week" meeting, for a company whose workers are agents that never attend it.

## Install

**As a skillpack (recommended):**
```bash
gbrain skillpack init cc-retro                       # scaffold the pack tree
cp -r app/gbrain-skills/sprint-retro cc-retro/skills/
gbrain skillpack doctor cc-retro --fix --yes         # score + auto-scaffold missing pieces
gbrain skillpack pack cc-retro                       # deterministic tarball + SHA-256
```

**Into a gbrain checkout:** copy `sprint-retro/` into `skills/`, add it to `skills/manifest.json` and a
`RESOLVER.md` row; `routing-eval.jsonl` is picked up by gbrain's routing eval.

**Into the hosted gbrain.io workspace:** `gbrain import` refuses paths with a `skills/` segment ("use the shared
skill publisher"), so publish it through the workspace's skill publisher (gbrain.io → Skills → add from folder /
paste `SKILL.md`). Until then any agent can run it directly: paste `SKILL.md` into the prompt with the department,
e.g. `Run the sprint-retro skill for marketing` (the agent uses the `gbrain-cloud` MCP tools listed in the frontmatter).

## Run it from C&C (headless Claude Code, no API key)

```bash
cd app
bun scripts/retro.ts --dept marketing     # one department; omit --dept for all four in parallel
bun scripts/retro.ts --dept arts --dry-run  # print the exact prompt + command
```

`retro.ts` pulls the department's open blockers (enemies) from `/api/state`, hands them plus `SKILL.md` to `claude -p`
(allowed tools: the `gbrain-cloud` MCP tools and file read/write), and the run writes the retro to GBrain
and to `company/<folder>/retros/<date>.md`. The run is itself an agent, so it shows up on the map as a unit.
A planet's factory can run the same command on a schedule, with the cadence set to the planet's cycle.
