# RUNBOOK: run, host and shut down C&C

The single source for bringing C&C back up and taking it down. Agents: read this before starting anything.

**Current state (Sep 28 2026): everything is shut down.** No local servers, no tunnels, no Superset agents, no scheduled
jobs, no River deployments, Memorable capture is off. Nothing is billing. Follow §2 to bring it back.

## 1. What runs where

| Piece | Where | Port | Needed for |
|---|---|---|---|
| C&C server (Bun: web UI, WebSocket, REST, `/hook`) | `app/`, `bun run start` | 7777 | everything |
| Sentinel sidecar (River-trained classifier) | `app/river/sidecar.py` | 7788 | blocker triage with the trained model (optional, see §4) |
| GBrain dev KB (hackathon docs for coding agents) | `~/.gbrain`, `gbrain serve --http` | 3131 | the `gbrain` MCP in `.mcp.json` (optional) |
| GBrain company brain | hosted, `https://gbrain.io/mcp` | n/a | the sun (company memory) |
| Superset host service | Superset desktop app, or `superset start` | n/a | launching agents from the map |
| Public read-only link | ngrok or cloudflared → 7777 | n/a | sharing the live map |

Claude Code sessions report to C&C through the HTTP hooks in `.claude/settings.json` (`POST localhost:7777/hook`).
C&C's own LLM calls (summaries, overview, command bar) use **headless Claude on the subscription**. There is no Anthropic API key.

## 2. Bring it back (from a fresh clone)

### One-time prerequisites
- **Bun** and **Claude Code**, logged in to the subscription (headless calls need it).
- **Python venv for River:** `python3.12 -m venv .venv-river && .venv-river/bin/pip install river-client==0.12.0`
- **GBrain CLI** (only for the dev KB): `bun install -g github:garrytan/gbrain`. It lands in `~/.bun/bin`.
  Never `npm i gbrain`: that's the wrong package.
- **Superset** desktop app, plus the CLI logged in separately: `superset auth login`.
- **Memorable CLI** (optional).
- **ngrok** or **cloudflared** (only for a public link).

### `.env` at the repo root (gitignored; never commit it)
| Key | Used by |
|---|---|
| `RIVER_API_KEY` | sidecar, Research Center retrain/eval (`app/server/research.ts`) |
| `GBRAIN_IO_TOKEN`, `GBRAIN_IO_URL` | hosted company brain (`.mcp.json` `gbrain-cloud`, `app/server/plugins/memory.ts`) |
| `GBRAIN_TOKEN` | local dev KB on :3131 (`.mcp.json` `gbrain`) |
| `SUPERSET_API_KEY` | optional; the Superset CLI and `app/scripts/report.ts`, otherwise OAuth login |
| `RIVER_MODEL`, `HARNESS`, `ORG_ID`, `MEMORABLE_BASE` | leftovers from setup; nothing in `app/` reads them |

Load `.env` with `set -a; . ./.env; set +a`. **The Superset CLI auto-loads `.env` from its cwd**, so run `superset …`
from outside the repo (e.g. `cd /tmp`), or a placeholder key breaks it.

### Start, in this order
```bash
cd ~/Documents/GitHub/OYIHack

# 1. Sentinel sidecar (optional; the demo's default triage engine is the local fast classifier)
nohup bash -c 'set -a; . ./.env; set +a; exec .venv-river/bin/python app/river/sidecar.py' > /tmp/sentinel.log 2>&1 &
curl -s 127.0.0.1:7788/health                      # {"ok":true,"model":"Qwen/Qwen3.5-9B",...}

# 2. GBrain dev KB (optional; one shared server, because PGLite allows only one writer)
(cd ~/.gbrain && nohup ~/.bun/bin/gbrain serve --http --port 3131 >> ~/.gbrain/serve-http.log 2>&1 &)
curl -s 127.0.0.1:3131/health

# 3. C&C server
cd app && bun install && bun run start             # http://localhost:7777
# Use `start`, not `dev`: `bun --hot` keeps old intervals running after reloads.

# 4. Superset host (to launch agents from the map): open the Superset app, or
(cd /tmp && superset start && superset status)     # "running": true

# 5. Public read-only link (optional)
ngrok http 7777 --host-header=rewrite              # or: cd app && bun run tunnel   (cloudflared)
# Remote viewers are read-only automatically (X-Forwarded-For / non-localhost Host → 403 on writes).

# 6. Memorable capture (optional; it was turned off at shutdown)
memorable enable
```

State: `app/data/world.json` (gitignored) persists the map every 5s. On a fresh clone there's no save, so C&C replays
`data/events.jsonl` if present and imports history from `~/.claude/projects/*OYIHack*` transcripts.
To-dos come from `company/todos.md`. Config (port, owner, Superset project id, teams, credit pools) is in `app/config.json`.

Useful scripts (from `app/`):
- `bun run sim`: synthetic agents, labeled SIMULATED.
- `bun scripts/colonize.ts --dry-run`: one real agent per team through Superset.
- `bun scripts/report.ts --publish`: rebuild and publish the after-action Superset Page.
- `bun run typecheck`

## 3. Things that trigger work or cost money while running
- **Recurring jobs (the moons)** live in the C&C server (`app/server/factories.ts`), not in Superset or cron. **While the
  server runs, each one launches a real Sonnet agent through Superset:**
  - Engineering: PR triage (daily 02:00), CI health (Mon 08:00)
  - Product: roadmap review (Mon 10:00)
  - Design: site QA (Wed 14:00)
  - Marketing: launch posts (daily 09:00), TikTok (12:00), Instagram (15:00), LinkedIn (Tue 09:00)
  - Operations: Daily Sync (18:00), spend report (Fri 16:00)

  If you only want the map, select each moon and toggle it off (the `factory_toggle` command).
- **Overview:** a headless Haiku call every 75s. Summaries and the command bar also call Claude (subscription usage).
- **River:** every sidecar classify and every Research Center retrain spends River credit. **Dedicated deployments bill
  GPU-hours from create to delete.** None exist; our key couldn't create them anyway (`app/river/STATUS.md`).
  Check with `client.list_deployments()`.
- **Superset agents** keep running in their worktree terminals until closed.

## 4. Shut everything down (what was done on Sep 28)
```bash
pkill -f 'bun server/index.ts'; pkill -f 'app/river/sidecar.py'; pkill -f 'ngrok http'; pkill -f cloudflared
pkill -f 'gbrain serve'                                        # dev KB, if running
# Stop C&C agents in Superset worktrees (run with bash; zsh doesn't word-split $pids):
bash -c 'for p in $(pgrep -f "/.local/bin/claude"); do lsof -a -p $p -d cwd -Fn | grep -q superset/worktrees/OYIHack && kill $p; done'
(cd /tmp && superset stop; superset automations list)         # expect: host stopped, []
memorable disable --yes
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(7777|7788|3131|4040) ' || echo "all ports closed"
```
Remote checks:
- River `list_deployments()` → 0.
- GBrain `schedule_list` → no schedules of ours (one built-in workspace job isn't ours to change).
- Claude Code: no crons or cloud routines.

**Still to do by hand (security, after the event):**
- Rotate the River API key.
- Revoke the GBrain token `oyihack-agents`.
- Rotate `GBRAIN_IO_TOKEN` if the repo stays public.
