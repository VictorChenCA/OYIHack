# OYIHack: Own Your Intelligence Hackathon (YC, Sep 27 2026)

**Hacking 13:15 → 17:00 hard deadline.** Optimize for a working demo, not completeness.

## Before you do anything
1. Read `kb/INDEX.md`. The local KB has every sponsor's docs and source. **Grep `kb/` before any web search.**
2. Read `kb/ARCHITECTURE.md` for decisions already made (harness, memory, transport, timeline).
   Don't re-litigate them; follow the fallbacks column if something fails.
3. Sponsors: River AI, GBrain, Memorable, QM, Superset, UFO. Cheat sheets are in `kb/sponsors/`.

## Rules for agents
- Speed > polish. Thinnest end-to-end path first; every change should leave the demo runnable.
- Integrate via MCP/CLI before writing SDK code. Reuse built-in integrations (gbrain↔memorable,
  QM↔gbrain/memorable, UFO↔gbrain) instead of rebuilding them.
- Timebox anything blocked for more than 15 minutes, then switch to the documented fallback and note it in `kb/EVENT.md`.
- Never commit `.env` or keys. Never `npm i gbrain` (wrong package; use `bun install -g github:garrytan/gbrain`).
- Memorable/GBrain consent and visibility: don't run `memorable enable` or write brain-wide memories unless the human asked.
- Toolchain: `gbrain` lives in `~/.bun/bin`. QM needs `PATH=/opt/homebrew/opt/node@24/bin:$PATH`.
  River Python is at `.venv-river/bin/python`.
- `kb/repos/*` are read-only references. Build the product in `app/` (or a new top-level dir), not inside `kb/`.
- New learnings (gotchas, working commands, sponsor answers) go in the relevant `kb/sponsors/*.md`,
  so parallel agents benefit.
