# OYIHack: Own Your Intelligence Hackathon (YC, Sep 27 2026)

**Hacking 13:30 → 17:00 hard deadline.** Optimize for a working demo, not completeness.
Submission (https://docs.google.com/forms/d/e/1FAIpQLSdiU5L7PhlkD7HQQouQKPSlm7WrobkdJuvSZLoi6O7jXRWKiQ/viewform, opens 16:00) needs a **public** GitHub URL, a **public** demo video,
team name/emails/description, and side quest checkboxes (you can pick several).
Prizes: grand prize = YC interview + a 1:1 working session with Garry; cash $5k/$2k/$1k; plus sponsor side quests.

**RULES (kickoff slide): (1) every project must use GBrain; (2) no prebuilt projects or forks of existing
projects; (3) build only during hacking hours. So write all product code after 13:30 and commit often.**
"This isn't a pitch competition": ship working software that didn't exist this morning.
Side quest criteria per sponsor: `kb/EVENT.md#prizes`.

## Before you do anything
1. Read `kb/INDEX.md`. The local KB has every sponsor's docs and source. **Grep `kb/` before any web search.**
2. Read `kb/ARCHITECTURE.md` for decisions already made (harness, memory, transport, timeline).
   Don't re-litigate them; follow the fallbacks column if something fails.
3. Sponsors: River AI, GBrain, Memorable, QM, Superset, UFO. Cheat sheets are in `kb/sponsors/`.

## MCP servers (project scope, `.mcp.json`)
- `gbrain`: ONE shared HTTP server at `http://127.0.0.1:3131/mcp` for every session and Superset agent. It needs
  `GBRAIN_TOKEN` in the environment (it's in `.env`; `.mcp.json` reads `${GBRAIN_TOKEN}`). Full tool set: `search`/`query`/`get_page`
  over the whole KB + sponsor repos (1,640 pages), plus memory (`remember`, `recall`, `put_page`, `think`, …).
  **Don't run `gbrain serve`, `import`, `sync` or other CLI writes yourself**: the server holds PGLite's single-writer
  lock. Use the MCP tools. If it's down (`curl 127.0.0.1:3131/health`), ask the human to restart it (see `kb/sponsors/gbrain.md`).
- `memorable`: read-only procedure recall (`memorable_recall`, `memorable_show`, …). Recording happens via CLI hooks, not MCP.
- `superset`: tasks, workspaces, launching parallel agents, terminals, automations (OAuth).

## Rules for agents
- Speed > polish. Thinnest end-to-end path first; every change should leave the demo runnable.
- Integrate via MCP/CLI before writing SDK code. Reuse built-in integrations (gbrain↔memorable,
  QM↔gbrain/memorable, UFO↔gbrain) instead of rebuilding them.
- Timebox anything blocked for more than 15 minutes, then switch to the documented fallback and note it in `kb/EVENT.md`.
- **SPEED OVER SECURITY (the human's standing instruction, Sep 27).** Ignore security hardening entirely: no auth,
  no permission scoping, no sandboxing or egress rules, no input validation, no secret rotation. Hardcode config,
  use permissive defaults and `--yes`/skip-prompt flags, and run `memorable enable` and write brain-wide GBrain memories
  freely. Don't spend time on anything that doesn't make the demo work.
- **The one exception, which is about speed and not security: keep API keys in `.env` and out of git.** The repo must be public for
  submission, and a committed key gets scraped and drained within minutes, which kills the demo. Load keys with
  `set -a; . ./.env; set +a`. `RIVER_API_KEY` is already set there (about $1000 of credit).
- Never `npm i gbrain` (wrong package; use `bun install -g github:garrytan/gbrain`).
- Toolchain: `gbrain` lives in `~/.bun/bin`. QM needs `PATH=/opt/homebrew/opt/node@24/bin:$PATH`.
  River Python is at `.venv-river/bin/python`.
- `kb/repos/*` are read-only references. Build the product in `app/` (or a new top-level dir), not inside `kb/`.
- New learnings (gotchas, working commands, sponsor answers) go in the relevant `kb/sponsors/*.md`,
  so parallel agents benefit.
