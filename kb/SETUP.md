# Setup checklist (do during lunch, 12:00–13:15)

## Already done on this machine (Sep 27, ~11:50)
- [x] Bun 1.4.2 (`bun upgrade`; GBrain needs ≥ 1.3.11)
- [x] `gbrain` 0.59.0.0 (`bun install -g github:garrytan/gbrain`), binary in `~/.bun/bin`
- [x] `memorable-cli` 0.5.30 (npm global)
- [x] Superset CLI 1.30.2 (`brew install superset-sh/tap/superset`)
- [x] Node 24.21 installed **keg-only** (default `node` is still 20). For QM, use
      `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`
- [x] River client in an isolated venv: `.venv-river/bin/python` (river-client, openai, transformers)
- [x] GBrain brain initialized (keyless PGLite at `~/.gbrain`)
- [x] **Project MCP servers in `.mcp.json`:** `gbrain` (7 memory verbs), `memorable` (5 read-only tools), `superset` (remote). gbrain and memorable were tested with a stdio handshake
- [x] Sponsor repos shallow-cloned into `kb/repos/` (gitignored; `kb/fetch.sh` re-fetches)

## You (human) must do, because these need a browser or account
- [ ] **Approve the 3 project MCP servers** when `claude` starts in this folder (or via `/mcp`)
- [ ] **Superset MCP OAuth:** in Claude Code run `/mcp`, pick `superset`, then Authenticate
- [ ] Optional: GBrain ambient writeback (agents auto-save memories): `gbrain config set memory.auto_writeback salient && gbrain bootstrap harness --yes`
- [ ] **Start Docker Desktop** (only needed for the QM local sandbox)
- [ ] **Superset desktop app**: download at superset.sh, sign in, add this repo as a project
- [ ] `superset auth login` (then `superset auth whoami`). Host daemon: the desktop app starts it; CLI-only machines run `superset start` (needs `gh auth login`)
- [ ] `memorable login`, then `memorable init` (or `init gbrain`), then `memorable enable`, then `memorable install-hooks`
- [ ] Get the Memorable `mk_...` key from https://memorable.sh/dash and put it in `.env`
- [ ] River: https://console.river.ai → API Keys → `RIVER_API_KEY` in `.env`. **Ask River for hackathon credits.**
- [ ] UFO: https://ufo.ai/login?signup=1 (hosted) **or** self-host (`kb/sponsors/ufo.md`). Ask about credits.
- [ ] QM: ask the QM team at kickoff for a hosted instance. Otherwise run `npm run dev-instance:web` (see qm.md)
- [ ] Model key for QM/UFO self-host: `ANTHROPIC_API_KEY` (QM) / `UFO_ANTHROPIC_API_KEY` (UFO)

## Two-minute smoke tests
```bash
export PATH="$HOME/.bun/bin:$PATH"
gbrain init --pglite --no-embedding && gbrain remember "hackathon smoke test" --provenance setup && gbrain search "smoke test"
claude mcp list    # project servers come from .mcp.json; no `claude mcp add` needed
memorable status
set -a; source .env; set +a; .venv-river/bin/python -c "import os,river_client as r;c=r.Client(api_key=os.environ['RIVER_API_KEY']);print(c.health_check(),list(c.get_capabilities()))"
```
