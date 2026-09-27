# GBrain: memory you control (garrytan/gbrain)

**Side quest prize:** "Solve tedious human problems with a new skill or memory improvement." All tracks are in `kb/EVENT.md#prizes`.
**GBrain is also MANDATORY: the rules say "Build something using GBrain" for every project.**

**What it is:** a personal or company "brain" built from markdown pages plus a DB (PGLite locally, or
Postgres/Supabase). It serves memory to any agent over MCP. Features: hybrid search (keyword, vector,
RRF, reranker), `think` (a cited synthesized answer with gap analysis), a typed knowledge graph, and
schema packs. It also runs a "dream cycle" daemon for overnight enrichment.
Garry Tan's production brain: 155K pages.

- Site: https://gbrain.io · Repo: https://github.com/garrytan/gbrain (local copy: `kb/repos/gbrain`)
- **Agent docs in repo:** `kb/repos/gbrain/llms.txt`, `llms-full.txt`, `AGENTS.md`, `INSTALL_FOR_AGENTS.md`, `docs/`
- Scraped site pages: `kb/raw/gbrain-*.md`

## From the kickoff talk: gbrain.io's four parts (Brad; Sina runs the open source)
- **Memory:** one memory shared across harnesses (Muse, Grok Bot, Codex, Claude). Their example: order food in one
  agent and check its status from another. Claimed to scale to ~500K docs. Team use case: a support inbox.
- **Tools:** escaping "API key hell." Point-and-click OAuth hookup done once, then **drop one GBrain endpoint into any
  harness** to get all tools and memory. Revoking a harness is one click, and harnesses never see the tool keys.
  Gmail is available from the CLI.
- **Skills:** they run their company on them. Most-used: **Daily Sync**, which reads all GitHub commits, email
  accounts and Stripe, and sends one digest email to the whole team daily. They're building more team skills.
- **Workspaces:** a multiplayer chat (several people in one prompt), SSO, and easy team invites.
- Vision: "Fortune 9 billion," meaning Fortune-500 agency for every person.
- **Side quest, in their words:** "solve a tedious task using GBrain... play around with skills... tedious tasks
  for people outside of this room who aren't as AI cool as we are." **Aim at non-technical users' chores.**
- Help: GBrain table on the floor, support@gbrain.io.

## Hackathon angles (kickoff + repo)
- **Hosted gbrain.io** fixes self-hosting's main problem (hard to reach without a server). Use it when the demo
  must be reachable from other machines or cloud agents.
- The team said the **PR backlog is a good hackathon target**: see open issues and PRs on `garrytan/gbrain`
  (205 open PRs, 882 merged, 2,244 closed unmerged as of Sep 27).
- **Side quest:** "Solve tedious human problems with a new skill or memory improvement." A skill is a
  `skills/<name>/SKILL.md` (frontmatter: name, version, description, triggers, mutating,
  writes_pages, writes_to) plus optional `routing-eval.jsonl`. There are 87 examples in `kb/repos/gbrain/skills/`.

## Product brain: gbrain.io hosted workspace (created Sep 27, ~14:35)
- **Two brains, two jobs:**
  - **Dev brain:** local, `gbrain` MCP, `127.0.0.1:3131`. Hackathon KB and sponsor docs, for our coding agents.
  - **Product brain:** hosted gbrain.io workspace "Victor's workspace", **`gbrain-cloud`** MCP. The demo company's
    memory, i.e. the RTS center. It started empty (1 page).
- Endpoint `https://gbrain.io/mcp`, header `Authorization: Bearer ${GBRAIN_IO_TOKEN}`. It's a read+write "Access token"
  client, and the token is in `.env` only. Claude sessions need `GBRAIN_IO_TOKEN` exported before launch (`set -a; . ./.env; set +a`).
- Engine is **Postgres** (server v0.48), so there's no single-writer lock and any number of agents can write concurrently.
- **108 tools**, including the 7 memory verbs, pages, graph (`traverse_graph`, `get_links`, `get_backlinks`), timeline,
  `takes_*`, `think`, `schedule_create/list/run/remove` (recurring jobs the workspace runs itself), `open_loops`
  ("who is waiting on you"), `workspace_files/read/write`, `get_brain_identity` (page/chunk counters), plus
  Gmail/Calendar and research tools (Perplexity, X, LinkedIn, company and investor lookup), all on the $50 credit.
- `host_resources` / `host_billing` don't answer for this client type ("not_a_workspace"). Check credit in the web UI.
- Raw MCP over curl works statelessly: POST JSON-RPC to the endpoint with `accept: application/json, text/event-stream`.
- The client can be revoked in the web UI under Settings → Clients ("Access token").

## Free hackathon workspace (hosted, https://gbrain.io/gratis/own-your-intelligence)
Mirrored at `kb/raw/gbrain-hackathon.md`.
- **Free hosted GBrain for 2 weeks, with $50 of AI credit. No card needed.** Sign in, and it's running in about 2 min.
  **One per person**, so have one teammate create it and invite the others (no extra cost; they share
  memory and the conversation). The offer ends Oct 5. After 2 weeks it pauses ($199/mo to keep), and
  it's deleted 5 days later if nobody keeps it.
- **Connect Claude Code (or any MCP client) with one URL:**
  `claude mcp add gbrain https://gbrain.io/mcp --header "Authorization: Bearer <token>"`. Mint the token
  on the client's page in the workspace; it's shown only once.
- Beyond memory, it has a **tools plane**: Gmail, Calendar, Drive, web search, and page fetch, with key
  custody, per-app permission levels, daily circuit breakers, and an activity log. CLI:
  `gbrainio tool gmail search --unread --newer-than 2d`. Plus Anthropic/OpenAI model choice
  (or your own key) and scheduled skills.
- **When to use it instead of local PGLite:** when the demo is **multiplayer** (the team or several machines
  share one brain), or when a cloud agent (QM, UFO, or a remote Superset host) must reach memory
  without `gbrain serve --http` + a tunnel. The local path below is still the fastest for single-laptop dev.
- Notes are plain markdown you can copy out, so the "own your intelligence" story still holds.

## Gotchas found while ingesting the KB (Sep 27, ~13:45)
- **PGLite has a single-writer lock: only ONE process can own `~/.gbrain` at a time.** Every Claude session
  (and every Superset agent) that loads `.mcp.json` spawns its own stdio `gbrain serve`, and all but the first
  fail with `CONNECTION_CLOSED`. `gbrain import`, `remember` and other CLI writes also block while any `serve` holds it.
  This includes `gbrain sync`: a `gbrain sync --dry-run` run while a serve was live found the serve and failed at the
  default source (it isn't a git repo), so nothing was written. Stop the server before any re-sync or re-import.
  Find the holder with `pgrep -fl "gbrain serve"`, stop it with SIGTERM (never steal a live lock), then run the command.
  **Fix for multi-session or swarm use:** run ONE `gbrain serve --http` daemon and point every client at it over
  HTTP. On PGLite, mint a token BEFORE starting serve (`gbrain auth create local-agents --scopes read,write`).
  Alternatives: the hosted gbrain.io workspace, or `gbrain migrate --to supabase`.
- **Our setup (Sep 27, 14:05): one shared `gbrain serve --http --port 3131` on loopback.** `.mcp.json` points every
  Claude session and Superset worktree at `http://127.0.0.1:3131/mcp` with `Authorization: Bearer ${GBRAIN_TOKEN}`.
  The token (`oyihack-agents`, full access, from `gbrain auth create`) lives only in the gitignored `.env`, so Claude and
  Superset must be launched with it exported: `set -a; . ./.env; set +a`. Without it, gbrain fails with 401 invalid_token.
  Revoke after the event: `gbrain auth revoke oyihack-agents`. The server runs as a background task of one Claude session
  (launchd persistence was blocked), so it stops with that session. Restart it from a terminal:
  `cd ~/.gbrain && nohup ~/.bun/bin/gbrain serve --http --port 3131 >> ~/.gbrain/serve-http.log 2>&1 &`.
  Log: `~/.gbrain/serve-http.log`. Admin UI: http://localhost:3131/admin.
  While it runs, CLI writes (`gbrain import`/`remember`/`sync`) block on the lock, so use MCP tools. Memorable's
  `init gbrain` backend writes through the CLI and would block too, so use Memorable's local store (`memorable init`).
  Codex agents don't read `.mcp.json`: `gbrain connect http://127.0.0.1:3131/mcp --token "$GBRAIN_TOKEN" --agent codex --install`.
- **`gbrain import` refuses any path containing a `skills/` segment** ("Import cannot publish skill paths. Use the
  shared skill publisher"). It also skips dot-directories (`.claude/`, `.codex/`). To import skill docs as plain
  pages, rename those segments in a staging copy (`skills` → `skill-docs`, `.claude` → `dot-claude`).
- **`gbrain import` silently skips files named `README.md`, `index.md` and `RESOLVER.md`**, so rename them
  (`kb/ingest.sh` stores them as `…/readme-doc`, `…/index-doc`, `…/resolver-doc`). It also **refuses files over
  about 1MB** (split them), and **fails on docs that contain literal `<!--- gbrain:facts:begin -->` or `takes`
  markers** ("fence cannot be parsed losslessly"), so neutralize those markers in example docs.
- **Staging under `$TMPDIR` (`/var/folders/...`) makes `gbrain import` exit 1 with no output.** Stage inside the
  repo (`kb/ingest-stage/`, gitignored) or under `/private/tmp`.
- Imports are incremental: unchanged pages are skipped by content hash, but checking ~1,600 pages still takes ~5 min.
- Very large files trigger a content-sanity warning (for example, UFO `spec.md` at 178KB). They still import.
- **What's in the brain:** the whole KB (notes plus `kb/raw`) under `oyihack/`, and every repo's markdown under
  `sponsor-repos/<repo>/` (gbrain, gstack, memorable-hackathon-kit, qm, superset, ufo-core), keyword-indexed with no embeddings (1,640 pages, 12,296 chunks on Sep 27 at 13:58).
  Test fixtures and node_modules are excluded. Re-run: `bash kb/fetch.sh` (pull repos + `scrape.py`), then `bash kb/ingest.sh`.

## Fastest path (keyless, no server, no Docker, about 2 min)
```bash
bun upgrade                                  # NEEDS Bun >= 1.3.11
bun install -g github:garrytan/gbrain        # NOT on npm: `npm i gbrain` is an unrelated package
gbrain init --pglite --no-embedding          # local keyless brain
claude mcp add gbrain -- gbrain serve --surface verbs   # expose memory verbs to Claude Code
gbrain doctor
```
Import notes and search:
```bash
gbrain import ~/notes/ --no-embed
gbrain search "phrase" --json               # raw hybrid retrieval
gbrain think "question"                     # synthesized, cited answer (needs a chat model configured)
gbrain remember "fact" --provenance demo --entity people/me
gbrain recall --entity people/me
```

## MCP surface: MEMORY_VERBS v1 (frozen protocol)
`recall`, `remember`, `entity`, `synthesize`, `forget`, `context_pack`, `delta`
- `--surface verbs` exposes exactly these 7; `--surface starter` exposes the starter set; no flag exposes every operation.
- Memories default to **brain-wide visibility**; pass `visibility: "private"` for local-only facts.
- Spec: `kb/repos/gbrain/docs/protocol/MEMORY_VERBS_v1.md`. `gbrain protocol --json` prints the schemas.
- Conformance: `gbrain protocol conformance --target <endpoint>`. **Any other memory server can
  implement these verbs**, which is a good hack angle.

## Serving / remote
```bash
gbrain serve                 # stdio MCP (Claude Code, Cursor, Codex)
gbrain serve --http          # HTTP MCP + OAuth 2.1 + /admin dashboard
gbrain mcp expose [--funnel] # publish via Tailscale (funnel = public HTTPS for cloud agents)
gbrain connect https://host/mcp --token gbrain_xxx --install   # point a client at a remote brain
gbrain agent register <name> --harness claude-code             # scoped OAuth client + token
gbrain config set mcp.instructions "Team brain for X"          # deployment identity banner
```
Claude Code plugin: `/plugin marketplace add garrytan/gbrain` then `/plugin install gbrain@gbrain`.

## Integrations already built (reuse them, don't rebuild)
- **Memorable:** `memorable init gbrain` plus `gbrain config set integrations.memorable.enabled true`
  stores procedures in the gbrain DB and captures them automatically at session end (see memorable.md).
- **QM:** can use gbrain as an external `mcp` memory provider (see qm.md, `MEMORY_PROVIDER_CONFIG`).
- **UFO:** ships `extensions/gbrain` (a `gbrain_git` source that syncs a GitHub repo's markdown as pages).

## Gotchas
- Bun >= 1.3.11 is required. The machine had 1.2.18 at setup time.
- Keyless = keyword search only. Semantic search needs an embedding provider, and `think` needs a chat model.
- Skill packs: `gbrain skillpack scaffold --harness claude-code`.
