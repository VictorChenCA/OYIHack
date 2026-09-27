# Architecture decisions: optimized for a 3h30m build (13:30 → 17:00)

## TL;DR
1. **Don't build an agent harness. Extend one.** QM or UFO is the runtime, and Claude Code is the dev loop.
2. **Integrate through MCP and CLI first, SDKs second.** GBrain, Memorable, and Superset all take one command each.
3. **GBrain = PGLite, keyless, local.** No Postgres, no Docker, no API keys.
4. **River is the only real schedule risk** (training latency; credits are free at the River booth). Start its job before 14:00 or cut it.
5. **Every hour must end in a demoable state.** Record a backup video at 16:30.

## Stack decisions
| # | Decision | Choice | Why (speed) | Fallback |
|---|---|---|---|---|
| D1 | Harness to extend | **QM if a hosted instance or a working local `dev-instance` exists by 13:45; otherwise UFO** | The brief names QM first. UFO self-hosts as one process on SQLite (lighter) | Claude Code + MCP as the "harness" |
| D2 | Memory (facts) | `gbrain init --pglite --no-embedding` + `gbrain serve` (stdio) / `--http` (for QM/UFO) | 2-second init, zero infra, keyword search is enough for a demo | Add an embedding key later only if recall quality is bad |
| D3 | Memory (procedures) | Memorable CLI (`init gbrain` or `init qm`), or raw `POST /v1/extract` from custom loops | Already wired into gbrain and QM; free 1,000/mo | Local store `memorable init` |
| D4 | Glue language | **TypeScript/Bun** for glue and QM work; **Python only for River** (Python-only SDK) and UFO extensions | Match each sponsor's native SDK; no bindings | Shell out to CLIs |
| D5 | Integration transport | MCP (stdio local, HTTP remote) > CLI subprocess > HTTP API > SDK | MCP gets agent tool use for free, with no UI code | — |
| D6 | Model training | River SFT LoRA on `Qwen/Qwen3.5-9B` (or whatever `get_capabilities()` lists), about 15–50 steps, **sample via `session.sample(checkpoint=…)`** | Deployments need a team key; sampling a checkpoint needs nothing extra | Fork the official `kb/raw/river/hackathon/style_chat.py` (a working SFT loop); base-model `client.sample()`; or skip River |
| D7 | Dev workflow | **Superset**: 2–4 parallel worktrees (one per slice); race agents on risky pieces | Parallelism is the only way to buy time; it also counts as sponsor usage | Plain `git worktree` + multiple Claude Code tabs |
| D8 | UI | Reuse the harness UI (QM web/Slack, UFO web/terminal, Superset Pages). Custom UI only if it IS the idea | UI is the biggest time sink | One static HTML page |
| D9 | Hosting | **Localhost demo** on your laptop | Deploys eat 30+ min | `gbrain mcp expose --funnel` if a cloud agent must reach you |
| D10 | Secrets | `.env` (gitignored) + `.env.example`; UFO needs `UFO_`-prefixed keys | Avoids leaking keys in a public demo repo | — |

## Integration map (what already talks to what, so reuse it)
```
                 ┌──────────── Superset (MCP/SDK: spawn agents in worktrees) ────────────┐
                 ▼                                                                         │
 Slack/Web ──> QM core ──(MEMORY_PROVIDER_CONFIG: type "mcp")──> GBrain serve --http       │
                 │   └──(type "memorable")──> memorable CLI ──> Extraction API ──> QM Postgres
                 │                                                                         │
 Slack/Web ──> UFO ──(extensions/gbrain: gbrain_git source)──> markdown pages              │
                 └──(model provider extension, OpenAI-compatible)──> River deployment ────┘
 Claude Code ──MCP──> gbrain (verbs) · memorable (read-only) · superset (remote)
```
Built-in edges you get for free: gbrain↔memorable, QM↔memorable, QM↔gbrain (mcp provider), UFO↔gbrain.

## Project ideas (ranked by sponsor coverage × feasibility × "ambitious/unexpected")
### 1. ★ Guaranteed core: "Company brain for QM" (QM + GBrain + Memorable). Low risk, finish by 15:00
- Register GBrain as QM's `mcp` memory provider for the `channel`/`org` scopes and Memorable as the
  `procedures` provider for `personal`.
- **Multiplayer demo:** a fact taught in #eng is recalled in #sales if the scope rules allow it, and
  isolation is shown when they don't. A task done once in one scope is faster the second time
  (Memorable shows turns before and after).
- It's the literal "extend QM and GBrain" brief, and every piece is a documented seam (`kb/sponsors/qm.md`).

### 2. Software factory (QM/Claude Code + Superset + Memorable + GBrain). Medium risk
- A message ("fix issue #12") makes the orchestrator call Superset `workspaces.create({agents:[…3 racers]})`.
- The winner's trace goes to Memorable, and decisions go to GBrain.
- A rerun shows recall injection cutting tool calls. Bonus: a Superset Automation makes it nightly.

### 3. "Own your weights": brain → model (GBrain + Memorable + River [+ QM/UFO]). High risk, high wow
- Export GBrain pages and Memorable procedures, build an SFT set, and LoRA-train on River.
- Serve the checkpoint as the model behind a QM/UFO scope. Demo: the model answers team-specific
  questions **without retrieval**.
- **Start the River job by 14:00.** Keep idea 1 as the safety net.

### 4. MEMORY_VERBS bridge (GBrain protocol + UFO or QM memory). Medium risk, crisp success test
- Implement the 7 frozen verbs over UFO's or QM's memory store and pass
  `gbrain protocol conformance --target <endpoint>`.
- "Any agent, any brain." It's clearly useful, and the criterion is objective.

### 5. RL on verified procedures (Memorable + River). Most ambitious
- Memorable postconditions (the verify command that passed) become the **reward function** for a
  River RL run on a tool-using task (`guides_rl-tools.md`). Only attempt this if the team knows RL.

**Recommended plan:** build 1 as the base. Layer 2 (if the team leans to coding agents) or 3 (if River
credits come through at kickoff) on top.

## Timeline
| Time | Goal | Exit criterion |
|---|---|---|
| 12:00–13:30 | Lunch + **setup** (`kb/SETUP.md`), get keys/credits, pick idea, and write the answers in `kb/EVENT.md` | Every sponsor CLI prints its version, and you're logged in |
| 13:30–14:00 | Thinnest end-to-end path; kick off the River job if using it | One request flows through every component |
| 14:00–15:30 | Core feature; Superset parallel slices | Idea 1 demoable |
| 15:30–16:15 | Wow layer (idea 2/3) | Or cut it; don't sink time |
| 16:15–16:30 | Freeze; README + architecture diagram | — |
| 16:30–16:50 | **Record the demo video** (required), make repo + video links public, submit (form opens 16:00) | Submitted before 16:55 |

## Known footguns
- `npm i gbrain` installs the WRONG package. Use `bun install -g github:garrytan/gbrain`.
- GBrain needs Bun ≥ 1.3.11. QM needs Node ≥ 24.15 and npm ≥ 11.10, plus Docker running for the local sandbox.
- Memorable does nothing until `memorable enable`. Logins are browser device flows, so a **human must approve**.
- QM memory providers accept **OAuth client credentials only** (no static bearer).
- UFO `.env` refuses bare `ANTHROPIC_API_KEY`; use `UFO_ANTHROPIC_API_KEY`.
- River personal keys **cannot create deployments**, and GPU-hours bill until you scale to zero or delete.
- Superset's SDK is alpha, and `workspaces.*` needs an online host (`superset start`).
