# C&C: build plan (final, Sep 27 14:55 · hard deadline 17:00)

**Rules for this plan:**
- The main session owns `shared/types.ts` and `server/world.ts`. Slices ask for changes and never edit them.
- Each slice owns its own files, so merges don't collide. Workspace names start with `eng-` so the swarm shows up on the Engineering planet.
- **Feature freeze at 16:05.** The video is recorded at 16:25 whatever state the build is in.

## 0. Prerequisites (human; must be done before the swarm starts)
- [ ] **Superset:** install the desktop app and sign in. Fix the invalid `SUPERSET_API_KEY` in `.env` (replace it or blank it),
      add this repo as a project, and check `superset projects list --local`.
- [ ] Add `export GBRAIN_TOKEN=…` to `~/.zshrc`, then restart Superset (agents need GBrain).
- [ ] Keep session `oyihack-d4` open: it hosts the dev GBrain on :3131.
- [ ] `memorable login` + `memorable enable` (otherwise the Memorable claim is dropped).
- [ ] Say go on the decisions in SPEC §11.

## 1. Milestones
| Time | Owner | Milestone | Exit criterion |
|---|---|---|---|
| 14:55 | Workflow agent | **S5 River Sentinel runs in a separate cloud session** (prompt in `app/river/TASK.md`): dataset → train → eval → sidecar `:7788` | Data by 15:20; training done by 15:50 |
| 14:55–15:20 | Main session | **M0 contract + skeleton:** deps, `data/`, **types v2** (every field slices need), **world v2** (planets, orbits and cycle clock, mines, enemies with merge/size/gold, squadrons), a route registry (`server/routes/<slice>.ts`), scene and UI stubs, and **`.claude/settings.json` hooks with Superset headers**. Sim updated. **Commit.** | `bun run dev` + `bun run sim` show the solar system with units and enemies; typecheck passes |
| 15:20 | Main session | **Launch the swarm:** S1–S4 plus S6 in Superset workspaces named `eng-s1-scene`, … | Swarm units appear on Engineering (dogfooding) |
| 15:20–15:45 | Main session | **Colonization round on the skeleton:** one real mothership per planet (prompts in §3) | Real enemies and gold appear |
| 15:45 | Main session | **Merge wave 1:** S4 then S3 | Spawn from the UI, prompt, summaries and ranking all work live |
| 16:00 | Main session | **Merge wave 2:** S2, S1, S6; S5 sidecar wired | Everything in the demo script (§4) runs |
| **16:05** | — | **Feature freeze** | — |
| 16:05–16:15 | Main session | Fix the top 3 issues; publish the Superset Page (a static HTML after-action report) | Page URL is public |
| 16:15–16:25 | Human | Rehearse the demo twice | — |
| 16:25–16:40 | Human | **Record the 1–2 min video** | Link set to anyone with the link |
| 16:40–16:55 | Human + main session | Scan `git log -p` for keys, make the repo **public**, check it in incognito, finish `kb/SUBMISSION.md` ([VERIFY] lines), **submit** | Submitted before 16:55 |

## 2. Slices (file ownership)
| Slice | Owns | Scope, in priority order | Never cut |
|---|---|---|---|
| **S1 Scene** | `web/scene/**`, `web/assets/**`, `CREDITS.md` | Nebula and starfield; the sun (GBrain, pulses); planets (colonization stages, orbit by cycle, beams); belt and mines; paths; fog; units by tier with project tint; subagent tethers; enemies (silhouette by type, color by quadrant, gold overlay, size); lasers and shockwave; squadrons; the **Research Center** station (glows while training); planet focus (camera zoom and filter) | Sun pulse, units, gold enemy with tethers |
| **S2 UI** | `web/ui/**`, `web/style.css` | **Bottom console** (agent mode first: context circle, name, summary, history, prompt; then commander mode); hover tooltip; side panel (enemy view with ranked list and "+ Deploy new"); top bar (mines, cycle); quests; toggles; control groups and stance; autonomy selector; view tabs; **Research Center panel** (models, runs with loss, Retrain, Promote) and "Correct classification" | Agent-mode console, ranked list |
| **S3 Brains** | `server/llm.ts`, `server/classify.ts`, `server/rank.ts`, `server/commander.ts`, `server/routes/brains.ts` | Haiku summaries on Stop; blocker classification (Sentinel sidecar client `:7788`, Haiku fallback; causeKey merge); ranking (Haiku over summaries plus Sentinel tier and department, cached); auto mode; commander tool use (`set_view` first, then spawn, prompt, attack) | Summaries, classification, ranking |
| **S4 Integrations** | `server/superset.ts`, `server/transcripts.ts`, `server/gbrain.ts`, `server/memorable.ts`, `server/mines.ts`, `server/factories.ts`, `server/routes/ops.ts` | Superset spawn and prompt (with headers mapping); transcripts (usage, context, history, cost); GBrain stateless MCP (counts, list_pages, recall preamble); Memorable recall; mines; factories (paused, "Run now") plus the `sprint-retro` GBrain skill; **River routes**: corrections.jsonl, launching `app/river/train.py`, sidecar `/reload` | Spawn and prompt, transcripts, GBrain counts |
| **S5 River** (cloud session) | `app/river/**` | Dataset → SFT → calibration → eval table → sidecar `:7788 /classify` → card data (`app/river/card.json`) | The eval table (base vs trained) |
| **S6 Memory** | `web/memory/**`, `server/routes/memory.ts` | Enter-the-sun explorer: nodes from list_pages, structural and real edges, search, page view, pulses | A searchable list, if the graph slips |

## 3. Colonization round (real agents, launched through C&C, 15:20–15:45)
| Planet | Project tag | Mothership prompt (subagents fan out; recall first, remember findings in GBrain) | Expected enemies |
|---|---|---|---|
| Engineering | GBrain PR triage | "Triage GBrain's 10 oldest open PRs (read-only): verdict, risk, next step" | Gold: a GitHub token to comment |
| Marketing | Launch campaign | "Draft the C&C launch thread, Show HN, TikTok and X scripts → `company/marketing/`" | Gold: X and TikTok accounts |
| Product Design | C&C site | "Build the C&C landing page (static HTML) and the demo storyboard → `company/design/`" | Amber: approval to publish |
| Arts | Brand | "Create the C&C logo, palette and OG image (SVG) → `company/arts/`" | Violet: missing brand input |

## 4. Demo script (1–2 min; final framing: a founder tool, not a game)
1. **System view:** "This is my company. The sun is our memory (GBrain). Each team sits at a distance that reflects how much the company knows about its work."
   Real agents launched through Superset are working across Engineering, Product Design and Marketing.
2. **Known vs new work:** repeat work flies toward the sun on known routes with an ETA. First-time work flies out into the fog.
3. **Memory:** an agent remembers something, and the sun pulses once with a caption of what was added. Click the sun to open memory.
4. **Blockers:** the four types (do now, schedule, delegate, drop), shown in the legend. A gold "needs you" blocker, such as an X signup
   needing a phone, sits at Marketing's frontier with tethers to the agents it's holding. The River-trained Sentinel classified it in about 4s
   (Research Center: base 0.545 → trained 0.916 on unseen blockers). Resolve it, and the agents continue.
5. **Delegate:** select a delegate blocker. Agents are ranked green→red by fit. Send the best one, or turn on Auto.
6. **Team view and agent view:** click Marketing, then an agent. The bottom bar shows its model, permission mode, what it's doing, where it's
   going and its history. Type a follow-up prompt, which goes to its Superset terminal.
7. **Command:** "show everything blocked on credentials" builds a view.
8. **Close:** "One person, a whole company of agents. Next: a system of companies."

## 5. Cut order (if behind)
1. Galaxy → one closing slide.
2. Planet focus filter → camera zoom only.
3. Memory graph → a searchable list.
4. Build menu and factory scheduling → one static factory plus "Run now".
5. Control-group naming, most toggles.
6. Commander tools beyond `set_view`.
7. Auto → Assist only.
8. Live Sentinel → classifications precomputed from the trained checkpoint (the eval table stays real).

## 6. Submission
`kb/SUBMISSION.md` (drafted by `oyihack-d4`). Tick a side quest only if it's real in the demo: Superset (swarm plus Page), GBrain
(`sprint-retro` skill plus the explorer), River (Sentinel eval), Memorable (only if charted lanes come from real recall).
