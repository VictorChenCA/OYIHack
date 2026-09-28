# C&C: Command and Control for AI agent companies

**C&C shows a founder what their company of AI agents is doing, what's blocking it, and where to send agents next, on one screen.**
It's built for founders, engineers and startup teams. It isn't a game: it borrows swarm management from real-time strategy
games (see the whole field at once, select, dispatch) and builds on GBrain, Superset, River and Memorable.

At kickoff, QM's team said nobody has figured out how to visualize swarms. C&C is our attempt.

> **Demo video:** https://www.youtube.com/watch?v=8xc9b_Gs4dM · **After-action report (Superset Page):** https://app.superset.sh/page/c-c-after-action-report-inxkbz

## How to read the screen
- **Galaxy view (C&C)** is the whole company. **Team view** is one team: Engineering, Product, Design, Marketing or Operations. The C&C logo opens the home page, where you switch between companies.
- **The sun is the company's memory (GBrain).** All teams sit the same distance from it. The sun pulses once when a memory is written,
  with a caption of what was added, and clicking it opens a compact review of what the company has learned.
- **Agents** are Claude Code sessions, drawn as sleek hulls: a lighter model is a lighter shape (Haiku → Sonnet → Opus → Fable). A main session (mothership)
  sends out subagents with the same hull, drawn smaller. Color = project. The right-side Legend explains every shape.
- **Time as distance:** agents explore outward from their team, slowing as they go (1s → 1 unit, 1 min → 1.5, very long → 2). The dotted
  line is the task's expected length (known work has an ETA), and first-time work fades into the fog, where we don't know yet how long it takes.
- **Moons are recurring jobs** (cron-style, e.g. the Daily Sync at 18:00). A moon's angle is its progress to the next run.
- **Blockers come in four types**, the urgency/importance quadrants:
  - **Do now:** urgent and important.
  - **Schedule:** important, not urgent.
  - **Delegate:** urgent, but an agent can take it.
  - **Drop:** neither.

  A **gold ring** means it needs a person (a key, a signup, a payment, an approval). Size = how many agents it's blocking. Each blocker
  sits just beyond the frontier of the team it concerns, tethered to the agents it's holding.
- **Credits** are the small asteroid clusters near the sun, one per budget (Claude, River, GBrain), thinning as they're spent.
- **The bottom bar is contextual.** With nothing selected it shows the company overview. Select a team, agent or blocker to see what it's
  doing, why it's stuck, and what to do. Prompt an agent directly, or ask the command bar ("show everything blocked on credentials").

## How it works

```
Claude Code agents (Superset worktrees)
   │  HTTP hooks: SessionStart, UserPromptSubmit, Pre/PostToolUse, Subagent*, Stop, StopFailure, Notification, PermissionRequest
   ▼
C&C server (Bun, :7777): the world reducer turns hooks into agents, blockers, teams and credits
   │   plugins: brains (summaries, triage, ranking, command bar via headless Claude) · ops (Superset, transcripts, GBrain, Memorable, River)
   ▼  WebSocket, 4 Hz
Pixi.js map + contextual UI
```
- **Superset launches agents.** "Start an agent" in C&C (or `scripts/colonize.ts`) creates a Superset workspace plus an agent, and
  prompts reach it through `superset terminals send`. The agents that built C&C show up on its Engineering team.
- **The River-trained Sentinel classifies every blocker** the moment it appears: kind, type, human-only or not, team, and best agent tier,
  with calibrated confidences. On 260 unseen blockers, mean accuracy went from 0.545 (base Qwen3.5-9B) to **0.916** (River LoRA);
  see `app/river/eval.md`. The Research Center lets you correct classifications and retrain.
- **Blockers merge by cause.** Five agents missing the same `GITHUB_TOKEN` make one larger gold blocker with five tethers.

## Sponsors

| Sponsor | What it does in C&C | Where to see it |
|---|---|---|
| **GBrain** | The company brain (hosted gbrain.io): agents recall on spawn and remember on finish; plus a new skill, [`sprint-retro`](app/gbrain-skills/sprint-retro/SKILL.md) | The sun (memory), team distance, the memory explorer, `company/<dept>/retros/` |
| **Superset** | The engine: spawns every agent in its own worktree and delivers prompts. C&C itself was built by a Superset swarm | Deploying from the map; the after-action report as a **Superset Page** |
| **River** | Fine-tunes the Sentinel, our own "System One" blocker classifier, and serves the base-vs-trained eval | Blocker classification, the Research Center card (base vs trained) |
| **Memorable** | Procedural memory: known task kinds become known routes with an ETA | Known routes vs the fog |
| QM, UFO | Not integrated. QM's "nobody can visualize swarms" framed the pitch | — |

## What's real vs simulated

| Real (live) | Simulated (labeled SIMULATED on screen) |
|---|---|
| Claude Code agents via HTTP hooks: the build swarm plus the agents launched through Superset | The scale shot (hundreds of agents, from `server/sim.ts`) |
| Spawning and prompting through the Superset CLI | A system of many companies (vision close) |
| GBrain reads and writes, page counts, the memory graph | Credits we can't meter (River and GBrain, entered by hand) |
| Token spend and context usage, from agent transcripts | Factory ticks while the scheduler is paused |
| AI summaries, ranking and the commander (headless Claude) | |
| The River-trained Sentinel with its base-vs-trained eval | |
| Memorable recall hits → known routes | |

## Run it

Full setup, hosting and shutdown steps: [`RUNBOOK.md`](RUNBOOK.md).

```bash
cd app && bun install
bun run dev                      # C&C on http://localhost:7777 (hooks → POST /hook)
bun run sim                      # optional: synthetic agents (marked SIMULATED)
bun scripts/colonize.ts          # launch one real agent per team through Superset (--dry-run, --planet marketing)
bun scripts/report.ts --publish  # write app/report/index.html and publish it as a Superset Page
```

Real agents report in through the HTTP hooks in `.claude/settings.json`. Any Claude Code session started in this repo, or in
a Superset worktree of it, appears in C&C. River: `app/river/` (sidecar on `:7788`, see its README).

## Repo map

| Path | What |
|---|---|
| `app/server/` | Bun server: `world.ts` (hooks → world reducer), `index.ts` (plugin host, REST + WS), `plugins/` (brains, ops, memory), `sim.ts` |
| `app/web/` | Pixi.js map (`scene/`), console and panels (`ui/`), memory explorer (`memory/`) |
| `app/shared/types.ts` | The data contract between server and client |
| `app/river/` | Sentinel dataset, training, eval and sidecar (River) |
| `app/scripts/` | `colonize.ts` (the initial population round), `report.ts` (the after-action report) |
| `app/gbrain-skills/` | The `sprint-retro` GBrain skill + install notes |
| `company/` | What the agent company produces, one folder per team |
| `kb/` | Hackathon knowledge base: sponsor cheat sheets, architecture decisions, submission draft |

## Credits

- Art: [Kenney](https://kenney.nl) space packs (CC0) and [Screaming Brain Studios](https://screamingbrainstudios.itch.io) backgrounds (CC0).
- Fonts: Rajdhani, IBM Plex Sans, JetBrains Mono (Google Fonts, OFL).
- "C&C" is a name-only nod to *Command & Conquer*. No EA logos, fonts or art are used.
- Built at the YC "Own Your Intelligence" hackathon (Sep 27, 2026) by a human plus a swarm of Claude Code agents running in Superset.
