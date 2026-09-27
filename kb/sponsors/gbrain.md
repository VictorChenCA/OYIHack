# GBrain: memory you control (garrytan/gbrain)

**Side quest prize:** "Solve tedious human problems with a new skill or memory improvement." All tracks are in `kb/EVENT.md#prizes`.

**What it is:** a personal or company "brain" built from markdown pages plus a DB (PGLite locally, or
Postgres/Supabase). It serves memory to any agent over MCP. Features: hybrid search (keyword, vector,
RRF, reranker), `think` (a cited synthesized answer with gap analysis), a typed knowledge graph, and
schema packs. It also runs a "dream cycle" daemon for overnight enrichment.
Garry Tan's production brain: 155K pages.

- Site: https://gbrain.io · Repo: https://github.com/garrytan/gbrain (local copy: `kb/repos/gbrain`)
- **Agent docs in repo:** `kb/repos/gbrain/llms.txt`, `llms-full.txt`, `AGENTS.md`, `INSTALL_FOR_AGENTS.md`, `docs/`
- Scraped site pages: `kb/raw/gbrain-*.md`

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
