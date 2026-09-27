# C&C (Command and Control): final spec (Sep 27, 14:50; updated 14:55)

The name is a nod to *Command & Conquer*. It's a name-only homage: no EA logos, fonts or art (trademarked); all art is CC0 (§9).

C&C is a real-time-strategy command center that lets one person run a company made of AI agents from one screen.
The submission draft in `kb/SUBMISSION.md` follows this spec. Inputs: the conversation, plus research on assets,
River, telemetry and GBrain, plus the requirements and feasibility critiques
(`/private/tmp/…/tasks/w838eqbrv.output`).


> **Design decisions from the founder's review (15:30, these override older text below):**
> - **Views:** **System view** is the whole company (solar system); **Team view** is one team. There are **3 teams**:
>   Engineering, Product Design, Marketing (Arts folded into Marketing).
> - **Wording:** say "agents" and "blockers", never units/enemies. Titles and names stay clean, and nothing is listed or labeled just for theme.
> - **Everything in space means something:**
>   - Distance from the sun = distance from what the company knows. Teams drift inward as their GBrain knowledge grows.
>   - A team's angle = progress through its cycle. Orbit rings aren't drawn; the cycle shows in the Team bar.
>   - Known work sits sunward of its team. First-time work flies outward into the fog of war (the unknown).
>   - Credits are small spinning asteroid clusters close to the sun.
>   - Blockers sit at the system's edge (friction from outside).
> - **The sun is calm:** one pulse per memory write, with a short caption of what was added, and it's clearly clickable to open memory.
> - **Layout:**
>   - top bar = folder navigation only;
>   - Orders and Visibility in a tuck-in left drawer;
>   - the bottom bar is fully contextual, with the company overview when nothing is selected, and an agent's model and permission mode under its icon.

## 1. Pitch and vision
- **You control as much as you want, as often as you want, and the system scales to the controller.** A beginner lets the
  assistant and autonomy do more; an expert micro-manages. When you fall behind, Assist mode offers more autonomy
  (for example, 3+ alerts unhandled for 2+ minutes). It never switches silently.
- **Why an RTS:** parallel work is dependencies, blockers, resources and attention. An RTS map shows all four at once.
  QM's team said at kickoff that nobody has figured out how to visualize swarms.
- **Vision ladder:** a planet is a department, a solar system is a company, and a galaxy is many companies. We build the solar
  system today. The pitch closes on the galaxy: one person running entire agentic companies.
- **Dogfooding:** we use C&C to run C&C's own company. The swarm building C&C appears on its own Engineering planet.
- **Stance:** productivity and control first, not a game skin. 2D top-down with a premium "tactical hologram" look. Z-axis later.

## 2. What's real and what's simulated
| Real (live) | Simulated, and labeled SIMULATED on screen |
|---|---|
| Claude Code agents, via HTTP hooks (build swarm plus demo agents) | The scale shot (hundreds of units), the galaxy |
| Spawning and prompting through the Superset CLI | Mines we can't measure (entered by hand) |
| GBrain product brain (hosted gbrain.io, `gbrain-cloud`): recall, remember, pages | Factory ticks, if the scheduler is paused |
| Claude token spend and context, from agent transcripts | |
| AI summaries and the commander agent (Claude API) | |
| River-trained Sentinel (checkpoint), with base vs trained results | |
| Memorable recall hits (if `memorable enable` has been run) | |

## 3. The world
### 3.1 Zoom levels
1. **Galaxy** (vision; simulated; built only if time allows).
2. **Solar system = the company.** The founder's view and the main screen.
3. **Planet focus = a department.** Clicking a planet zooms the camera to it and filters to that department's
   units, enemies, factories and lanes. The breadcrumb reads Company › Engineering. This is "entering" the department's map.
   A separate tile renderer is cut for time.

### 3.2 Solar system layout (static positions plus slow orbits)
- **The sun is GBrain**, the product brain. It's one brain for the whole company.
  - It pulses on every live memory read or write: hook events whose `tool_name` matches `mcp__gbrain(-cloud)?__*`.
  - Reads and writes pulse in different colors.
  - Click the sun to open the **memory explorer** (§3.6).
- **Four planets are the departments.** Each starts **uncolonized** and grows through 4 stages as work and knowledge build up:
  barren, then a crossfade to the department's own planet art, then city lights on the night side, then a ring and satellite.
  - **Engineering:** C&C itself, plus a triage of GBrain's real PR backlog (read-only).
  - **Marketing:** launch thread, Show HN post, TikTok and X scripts, outreach list.
  - **Product Design:** landing page, demo storyboard, onboarding, UX specs.
  - **Arts:** brand identity, logo, palette, OG image, visual assets, video b-roll.
- **Orbits are cycles.** Planets orbit very slowly, and one orbit is one cycle, set per planet as a sprint (repeating)
  or a deadline (one-off):
  - Angle = baseAngle + 360° × cycle progress. Base angles are 90° apart so the planets never overlap.
  - Each orbit ring has day ticks and a cycle-end marker at its baseAngle.
  - The company default is a **1-week sprint**.
  - **Demo default:** a sprint starting today, Sunday. Engineering is set to a **deadline cycle ending at 17:00** (hackathon
    submission), which shows the setting is configurable. You can change this (§11).
- **The asteroid belt (south of the sun) holds the mines.** Each mine is a credit pool, and **space paths** run from each
  consumer to its mine (animated dots flowing toward the consumer).
- **Each planet's colony HQ is powered by the sun:** an **energy beam** from the sun to the colony's solar array.
  Its brightness is the department's recent memory traffic.
- **The edges of the system are the frontier** (fog). First-time work flies out there.
- **Enemies gather at the system's edge** near the planets they block. A cause shared by two departments sits between them.

### 3.3 Units
- **Every Claude Code agent is a unit.** A **mothership** is a main session. Its **subagents** are small craft that fly out,
  work and dock back, with a dashed tether to the parent.
- **Color = project**, a tag chosen at spawn (e.g. "C&C app", "GBrain PR triage", "Launch campaign"). It isn't the git
  root, because every worktree shares one repo. Units on one project share a hue, so dependencies read at a glance.
- **Silhouette = model tier:**
  - Haiku: scout (`ship_A`)
  - Sonnet: frigate (`ship_B`)
  - Opus: cruiser (`ship_E`)
  - Fable: capital ship (`ship_H`)
  - Subagent craft: `ship_sidesC` at small scale

  The tier comes from the `model` in the transcript.
- **The River Sentinel is a special unit** (§8, the detector): a crystalline teal "gem" (`meteor_squareLarge`, counter-rotating
  shards, a twinkle, a glow) with a "RIVER · forged" badge.
- **Movement:** progress = elapsed ÷ ETA.
  - First-time tasks have no ETA ("?") and drift toward the fog.
  - Charted tasks travel a lane with a known ETA (§3.5).
  - A blocked unit halts on its lane.
- **Health** is a cosmetic ring showing remaining budget (time, and credits where known). Failures chip it.
- **Squadrons:** above 12 units in one area, units cluster into a squadron icon with a count, and their tethers bundle.
  This keeps the map legible at scale.
- **Reorganizing:** drag-select, and control groups (Ctrl+1..9 assigns, 1..9 selects; groups can be named).
  - Each group has a **stance**: Hold / Auto-attack non-gold / Assist.
  - A group accepts a **broadcast prompt**.
  - Units can be reassigned to another project or planet.

### 3.4 Factories (recurring work)
- A factory is a recurring task on its planet (cron cadence or trigger). It shows cadence, a ring counting down
  to the next run, **outputs per day**, **credits per day**, and a stack of outputs.
- Implemented with C&C's own scheduler, which launches an agent through Superset on each run. Factories start **paused** with a
  **Run now** button, so demo spend stays in check. (Superset Automations need a paid Pro plan, so we don't use them.)
- **GBrain skill factory:** `sprint-retro`, an end-of-orbit digest that writes the cycle's results back into GBrain.
  We ship it as a GBrain `SKILL.md` for the GBrain side quest, and it also runs as a factory.
- **Build menu:** each planet has one; placing a factory sets its schedule and shows the projected credits per day.
- **Suggested factories:** when the same kind of task repeats 3 times, the assistant suggests "Build a factory".

### 3.5 Frontier vs charted territory (Memorable plus our history)
- **A charted lane** is a task kind we've seen before. It's charted if Memorable's `recall` returns a procedure
  (whose steps become waypoints on the lane), or if our own history has a duration for that task signature.
- **ETA** = the median of our recorded durations for the signature (`data/durations.json`). Memorable stores steps, not durations.
- **First run = fog:** no ETA, and the unit drifts into the frontier. Repeat runs = charted, with a known ETA and a
  veteran badge.
- This needs `memorable enable` (a consent step). Without it, lanes come from our history only, and the Memorable claim is dropped.

### 3.6 Memory explorer (inside the sun)
- **Nodes** are the product brain's pages, from `list_pages` (paged 100 at a time), colored by department. Departments are slug
  namespaces `company/<dept>/…` plus a `dept-<x>` tag, not GBrain "sources": our tokens are scoped to one source.
- **Edges:**
  - real `get_links` where they exist;
  - structural parent-folder edges (dashed);
  - C&C calls `add_link` when an agent writes a page that mentions another page.
- **Live pulses:** from hook events. Where `/admin/events` isn't available (hosted), poll `list_pages {sort:updated_desc}` every 3s.
- **Search** calls `search`, and **clicking a node** calls `get_page {include_content:true}`.
- Access is stateless MCP over HTTP: POST `tools/call` with a bearer token. The response is an SSE `data:` line whose
  `result.content[0].text` holds JSON that has to be parsed a second time.

### 3.7 Permission modes (inheritance)
- A **mothership** (main agent) runs in one permission mode: `default`, `acceptEdits`, `auto`, `plan` or `bypassPermissions`.
  Swarm agents launched for its task are started in **the same mode**. Superset launches agents from a preset, so there is one
  preset per mode (`claude --permission-mode <mode>`).
- **Subagents inherit it automatically.** Claude Code runs a subagent in the main conversation's mode. When the parent is in
  `auto`, `acceptEdits` or `bypassPermissions`, a subagent's own `permissionMode` setting is ignored. Only in `default`/`plan`
  can a subagent definition use a different mode. That's the "changed when necessary" case, and it's rare.
- **On the map:** each unit shows a small badge for its mode, read from the hook field `permission_mode`. A unit whose mode
  differs from its mothership gets a warning outline. Changing a running agent's mode means relaunching it in the new mode
  (C&C can't flip a live terminal's mode).

### 3.8 Filter: hide anything, at every level
- One **filter** hides anything at any level: galaxy → company → planet → project → unit/session → event type
  (e.g. hide a planet, a project, one agent, or all tool events). Hidden things aren't drawn. Anything can be un-hidden later.
- Telemetry is on for every Claude session in this repo. Payloads stay local (`data/events.jsonl`, gitignored).

## 4. Sponsors: used where they fit
| Sponsor | Role | Where you see it |
|---|---|---|
| **GBrain** (mandatory) | The product brain (hosted `gbrain-cloud`). Every agent recalls on spawn and remembers on finish (a preamble in the spawn prompt) | The sun, energy beams, the memory explorer, knowledge counts, the `sprint-retro` skill |
| **Memorable** | Procedures: charted lanes and veterans | Lanes vs fog, the veteran badge |
| **Superset** | The engine: spawns every agent in a worktree and delivers prompts. C&C is built by a Superset swarm | The after-action report as a **Superset Page** |
| **River** | Trains the Sentinel, our own System One classifier (§8) | The detector unit, its scan beams and card |
| QM / UFO | Skipped. QM's "swarm visualization" problem frames the pitch | — |

## 5. Resources (the RTS economy)
- **Credits** are the primary resource, held in **mines** in the asteroid belt:
  - **Claude API:** measured. Sum transcript `usage` × price (Haiku $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25,
    Opus 5.5 $4/$20, Fable 5.1 $10/$50 per million tokens in/out; cache reads 0.1×, cache writes 1.25×/2×).
    Deduplicate by `message.id`, and include the subagent transcripts.
  - **River:** hackathon credits, entered by hand.
  - **GBrain:** the $50 AI credit, entered by hand.

  Each mine shows what's left, its burn rate per day, and shrinks as it depletes. An empty mine spawns a gold billing enemy.
- **Tokens** are how units spend. Each unit shows its burn, and a space path runs to its mine.
- **Knowledge** is permanent upgrades, not spent: GBrain pages and facts, Memorable procedures, charted lanes.
- **No supply cap.**
- **Top bar:** credits per mine with burn per day, tokens this cycle, knowledge counts, cycle progress.

## 6. Enemies (blockers)
- **Detection:**
  - Hooks: `PermissionRequest`; `Notification` (`permission_prompt`, `idle_prompt`, `agent_needs_input`, `elicitation*`);
    `StopFailure` (`error`: `authentication_failed`, `billing_error`, `rate_limit`, …).
  - A `Stop` whose last message ends in a question or says it's blocked.
  - A dependency wait (the task needs another unit's output).
- **Classification:** Haiku reads the last message and returns `{title, causeKey, type, quadrant, humanOnly, reason}`.
  - Enemies with the same `causeKey` **merge into one enemy**.
  - **Size = strength** = the number of blocked units, growing slowly the longer they wait.
- **Silhouette = blocker type:**
  | Type | Silhouette |
  |---|---|
  | credential | dreadnought `ship_sidesB` |
  | account / signup | fortified station `station_C` plus a shield |
  | approval / permission | a sentinel |
  | rate limit / billing | a drone swarm `enemy_D` × N |
  | missing info | a derelict station |
  | dependency | a linked hulk that also tethers to the unit it waits on |
- **Color and aura = the 2×2 quadrant:**
  - Do now (urgent and important): red, fast pulse.
  - Schedule (important, not urgent): amber, slow pulse.
  - Delegate (urgent, not important): violet.
  - Drop: grey, drifting.
- **Human-only enemies are gold:** a gold outline, a rotating halo and a "!" badge. Agents always attempt the step first
  (e.g. a signup). An enemy turns gold only when it hits a truly human-only step (phone, CAPTCHA, payment, legal, secrets).
  You resolve a gold enemy in the side panel: a checkbox plus a note. **Secrets never enter C&C**: you put them in `.env`,
  and C&C only tells the units "unblocked".
- **Tethers:** from each blocked unit to its enemy, labeled with the reason. This shows what's blocked by what, and why.
- **Attacking:**
  - Select an enemy, and every unit is **ranked green→red** (the Sentinel's tier and department plus Haiku over unit summaries, §8), each with a reason chip.
  - The list ends with **"+ Deploy new Haiku/Sonnet/Opus/Fable"**.
  - Send one or more units: each gets the blocker as a follow-up prompt through Superset, flies out and fires (lasers).
  - The enemy shrinks as blocked units resume, and explodes (shockwave) when cleared.
  - Sending a busy unit queues the blocker. Shift-send interrupts it.
- **Resolution:** C&C sends each blocked unit "Unblocked: <resolution>. Continue."
- **Autonomy:**
  - **Manual.**
  - **Assist** (the default): suggestions only.
  - **Auto:** non-gold enemies are attacked automatically by the top-ranked free unit. Gold always waits for you.

  Auto does **not** auto-assign idle units (spend risk).

## 7. The bottom console and the rest of the UI
- **Default view is deterministic.** The **commander agent** can create **custom views**, saved as tabs next to "Default":
  highlight, hide, filter or ping units, enemies, planets or factories.
- **Hover:** a small tooltip by the cursor. **Click:** the full side panel on the right.
- **Top-left:** commander assistant quests. They come from deterministic rules (idle units, gold enemies, empty mines, cycle
  end, a 3× repeat suggesting a factory, nobody on the frontier), plus Claude "strategy" advice every 5 minutes.
  Examples: "Worker idle on Marketing: assign it", "Expand to TikTok".
- **Left edge: visibility toggles** for units, tethers, enemies, factories, mines and paths, beams, fog, labels, orbits.
- **Top center:** a breadcrumb and the cycle progress. **Top bar:** resources (§5).
- **Bottom console (large):**
  - **Commander mode** (nothing selected): chat with our commander agent, built on Claude tool use. Its tools: spawn,
    prompt, attack, group, set_stance, build_factory, set_view (highlight / hide / ping / filter / camera).
  - **Agent mode** (a unit selected), where the bar transforms:
    - **Bottom-left:** a big **context circle**, a radial gauge of context-window use (tokens used ÷ window, from
      transcript `usage`), with a small tier portrait in the center. Hovering lists what's in context: files read and GBrain pages recalled.
    - **Top of the bar:** the agent's name.
    - **Top of the middle section:** what it's trying to do, an **AI summary** (Haiku) refreshed on each Stop. This
      summary is also the ranking's input.
    - **Middle:** its past conversation history from the transcript (prompts, replies, tool calls paired with results).
      Click an entry to open the full thing.
    - **Very bottom:** a **chat input like Claude Code** that prompts this agent through `superset terminals send`.

## 8. River: the Sentinel, a "System One" model we own
- **Concept:** TypeSafe's Jev (typesafe.ai/blog/introducing-system-one-models-and-jev) calls it a *System One model*:
  unstructured state in, **typed decisions with calibrated probabilities** out, fast enough for software to call on
  every event. Jev is a proprietary early-access API. **We train our own System One model on River**, tuned to C&C's
  triage policy. "Own your intelligence."
- **What it decides:** every blocker or issue, the moment it appears (hook payload plus the agent's last message), gets 5 typed fields.
  Each is an enum with a probability distribution:
  | Field | Values |
  |---|---|
  | `kind` | credential · account · approval · rate_limit · billing · missing_info · dependency · failure |
  | `quadrant` | do_now · schedule · delegate · drop |
  | `human_only` | yes · no (yes means gold) |
  | `department` | engineering · marketing · product_design · arts |
  | `tier` | haiku · sonnet · opus · fable (the best unit class to send) |
- **How it's fast and type-safe on River:**
  1. Each field is a one-token label code.
  2. One prompt per field, all fields and items in one batched `sample(max_tokens=1, temperature=0, logprobs=K)` call.
     This is the "parallel sampler" idea.
  3. Probabilities come from the top-K logprobs, **renormalized over the allowed labels only**, so an invalid label is impossible.
  4. Calibration: temperature scaling fit on a validation split (stretch: River RL with a log-score reward, like Jev's "calibrated decisions").
- **Base model:** time `Qwen/Qwen3.5-9B` against `nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4` first and pick the faster.
- **Data:** a Claude teacher generates realistic blockers (permission prompts, auth/billing/rate errors, "I need X" messages,
  signups, dependencies) and labels them with **C&C's written triage policy**. Held out as "unseen": services, vendors and
  phrasings never seen in training, plus real blockers from C&C's `events.jsonl`.
- **Eval (River's judging: base vs trained on unseen tasks):**
  - per-field accuracy and macro-F1;
  - calibration (ECE, Brier);
  - latency p50/p95;
  - cost per 1k decisions.

  Compared against base (same prompt), and against Claude Haiku (JSON) as the speed and cost reference.
- **Serving:** a local sidecar (`app/river/sidecar.py`, `.venv-river`) on `127.0.0.1:7788`, `POST /classify`. The server's
  `classify.ts` calls it, with a 3 s timeout, then falls back to Haiku.
- **In the UI:** the Sentinel is the RTS **detector** unit, a crystalline teal "RIVER · forged" gem near the sun.
  - Every new enemy gets a scan beam, and its type icon, quadrant color, gold flag and confidence stamp on.
  - Low-confidence calls show a "?" for a human look.
  - The card shows the eval table (base vs trained, vs Haiku), latency, dataset examples, the loss curve, and the `river://` checkpoint.
- **Suitability ranking** (green→red) uses the Sentinel's `tier` and `department` plus the unit summaries, scored by Haiku. It's kept simple.

### 8.1 The Research Center (River in the product)
- A **building** on the system map: an orbital research station next to the sun. River models are created, fine-tuned and
  promoted there. It's the RTS "research lab / barracks" for owned intelligence.
- **Inside:**
  - **Models:** base and trained checkpoints (`river://…`), each with its eval card.
  - **Training runs:** status, live loss curve, cost drawn from the **River mine** (a space path to the belt).
  - **Datasets:** the teacher-generated set plus **human corrections**.
  - **Promote:** make a checkpoint the active Sentinel. The Base/Trained toggle is here too.
- **The data flywheel:**
  1. In an enemy's side panel, **"Correct classification"** lets you relabel any field. It's appended to `data/corrections.jsonl`.
  2. The Research Center shows "N new corrections", and **Retrain** launches `app/river/train.py` on River with teacher data plus
     corrections. Progress streams into the station, which glows while training.
  3. Eval, then promote. The detector unit is upgraded (a visual "tech upgrade").
- **Built from the cloud session's reusable scripts:** `train.py`, `eval.py`, and the sidecar's `/reload`.
- **Speed gate:** if River's live p50 is over about 1.5 s, the hot path uses a **traditional classifier** (logistic regression on
  embeddings, trained locally on the same labels). The River model still does the evaluation, the Research Center and
  promotion. That keeps the River side quest intact.

## 9. Art direction: "tactical hologram"
- **Assets:** Kenney CC0 packs (Simple Space, Particle Pack, Planets, Space Shooter Remastered/Extension), plus
  Screaming Brain Studios' CC0 nebula. They're already downloaded in the session scratchpad.
  - Copy about 60 files to `app/web/assets/`, run `sips -Z 512` on the planets, and add a `CREDITS.md`.
  - Load individual PNGs (the atlases are Starling XML).
- **Tinting:** units and enemies are white vector sprites with `tint` set to the project or quadrant color.
  - Project palette: 0x4FD1FF, 0x5CF2B0, 0x7C9CFF, 0xB8F34A, 0xFF7AD9, 0x2EE6D6.
  - Enemy colors: red 0xFF4D4D, amber 0xFFB020, violet 0xA774FF, grey 0x8A8F98, gold 0xFFD24A.
- **Effects:** `pixi-filters@6.1.5`.
  - One AdvancedBloom on the world container.
  - GlowFilter only on the selected unit, gold enemies and the Sentinel.
  - ShockwaveFilter when an enemy is cleared or a big memory write lands.
  - Glow on every other unit comes from additive `circle_05` sprites, not per-sprite filters.
- **Background:** a nebula TilingSprite plus an additive starfield parallax. Fog is a radial gradient plus drifting smoke.
- **Sun:** tinted `sphere1`, counter-rotating additive `light_*`, a halo and a pulse ring.
- **Lasers:** `trace_05`. Explosion: a ring, a spark burst and smoke.

## 10. Architecture
```
Claude Code agents in Superset worktrees --HTTP hooks (+ X-SS-Workspace/Terminal headers)--> C&C server (Bun :7777)
                                                                    ├─ world reducer → data/events.jsonl, durations.json
                                                                    ├─ transcripts (usage, context, history)
                                                                    ├─ llm.ts: Claude (summaries, classification, commander)
                                                                    ├─ Sentinel sidecar (River, Python, :7788) with Haiku fallback
                                                                    ├─ gbrain.ts: stateless MCP to gbrain-cloud (and :3131 for dev KB)
                                                                    └─ superset.ts, memorable.ts, scheduler (factories, cycle clock)
Browser: Pixi v8 scene + DOM UI <── WebSocket state (4 Hz) ── server;  Browser ──POST /command──> server
```
- **Hooks** are committed at the repo root in `.claude/settings.json`, before any worktree is made. All events go to `:7777/hook`
  with a 3 s timeout, and a down server is non-blocking. Superset's workspace and terminal ids arrive as HTTP headers
  (`X-SS-Workspace: $SUPERSET_WORKSPACE_ID`, via `allowedEnvVars`).
- **Payload fields:** the prompt is `prompt`; StopFailure uses `error`; subagents carry `agent_id` and `agent_transcript_path`.
- **Transcript:** the model is `.message.model`, usage is `.message.usage.*` (deduplicate by `.message.id`), and subagent
  transcripts live in `<session>/subagents/**`.
- **Web app** on localhost (`bun run dev`); it can be opened in Superset's built-in browser.
- **Budgets:** River up to $500 (Sentinel training and Research Center retrains). Anthropic API up to $50 (summaries,
  classification fallback, commander, teacher). The mines show both as live pools.
- **Contract:** `app/shared/types.ts` v2 is owned by the main session. Slices ask for changes; they don't edit it.

## 11. Decisions (defaults in bold; the user can override)
1. **Cycles:** a **1-week sprint starting today**, with Engineering on a **17:00 deadline cycle**. Alternative: Monday-start sprints (today is day 7/7).
2. **Memorable:** the user runs `memorable login` and **`memorable enable`**; otherwise the Memorable claim is dropped.
3. **Self-serve signups:** agents may attempt only signups whose terms allow automation. X, TikTok and Instagram are **gold** from the start.
4. **Product brain:** **hosted gbrain.io (`gbrain-cloud`)**. The local `:3131` server stays as the dev KB.
