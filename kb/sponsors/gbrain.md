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

## From the kickoff talk (Granola, Sep 27)
- **Hosted GBrain now exists (gbrain.io).** "Turn a key" and an instance is up in a few minutes. This
  fixes self-hosting's big problem (hard to reach unless you run a server). Use it if the demo must be
  reachable from other machines or cloud agents.
- gbrain.io is "4 different things", starting with memory (the open-source core). The other three
  weren't covered in the notes; the site lists Skills and a skills directory.
- Pitched as scaling to ~500K documents, all shared. Team use case they named: a **support inbox**
  ("equivalent to 20 years of an individual's email").
- The team said the **PR backlog is a good hackathon target**: look at open issues and PRs on `garrytan/gbrain`.
- **Side quest:** "Solve tedious human problems with a new skill or memory improvement." A skill is a
  `skills/<name>/SKILL.md` (frontmatter: name, version, description, triggers, mutating,
  writes_pages, writes_to) plus optional `routing-eval.jsonl`. There are 87 examples in `kb/repos/gbrain/skills/`.

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
