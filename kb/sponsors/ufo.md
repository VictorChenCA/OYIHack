# UFO (ufo.ai): "Business agent operating system"

**Side quest prize:** "Best extension, Best business automation for startups." **Prize: unlimited lifetime UFO access.** All tracks are in `kb/EVENT.md#prizes`.

**What it is:** an open-source (Apache-2.0) **runtime for team AI agents**. Teammates give agents
work in chat (web, Slack, terminal). Agents read files, run commands, browse, use connected accounts,
build and host internal **sites/apps**, run **scheduled tasks**, and keep **scoped memory**
(private/workspace/room). The hosted service at ufo.ai runs the same code.
Stack: Python 3.12 (`ufo.harness`, `ufo.runtime`, `ufo.host`, `ufo.sdk`), DBOS durable turns,
SQLite or Postgres/S3/Redis, Rust terminal client and servers.

- Site: https://ufo.ai · Docs: https://ufo.ai/docs/ (scraped: `kb/raw/ufo-docs*.md`) · Web app: https://app.ufo.ai
- Repo: https://github.com/ufo-ai/ufo-core (local: `kb/repos/ufo-core`; **pushed today**)
- Read locally: `README.md`, `spec.md` (design source of truth), `AGENTS.md`, `extensions/sample`
- Slack community: https://join.slack.com/t/ufo-oss/shared_invite/zt-4b187sgtd-AysrUM5xku8FJ6BiPMyF5w

## From the kickoff talk (Marshall and Alex, co-founders)
- UFO = "an open agent harness to run your business on," from the team that built GitHub Copilot and Perplexity
  Computer. The core engine was **open-sourced last night**, and sign-ups are open. It runs in Slack, web, terminal and
  **iMessage**, and aims at thousands of durable agents with shared memory, data-ingesting connectors, and automations.
- **Two tracks:** (1) an extension on the open-source core. They especially want **links between the sponsors**:
  "an extension to integrate with GBrain, QM, even River or Memorable would be great to hack into UFO." (2) The best
  **business automation** for startups.
- Alex: "everything is an extension (sandboxing, memory...), so if you have a crazy idea that's hard to fit into an
  existing harness, build it here." On real tasks: models are lazy and subagents finish early; **look at the
  data**, then calibrate LLM judges on the failures you saw.
- UFO booth on the floor. Garry called Perplexity Computer "one of the greatest harnesses ever created."

## Option A: hosted (fastest to demo)
```bash
curl -fsSL https://ufo.ai/ufo | sh      # installs native client to ~/.ufo/bin (script reviewed: kb/raw/ufo-install.sh)
ufo                                      # sign in; runs file/shell work in CWD on your machine
ufo --remote                             # run in hosted sandbox; --wait N / --resume ID
```
Sign up at https://ufo.ai/login?signup=1 with a work email. **Billing is a prepaid balance with
auto-refill; you need a card.** Ask the sponsor for credits. You can also bring your own model key.

## Option B: self-host (one process, SQLite, no Docker)
```bash
cd kb/repos/ufo-core
make install                                # uv sync
cp .env.template .env                       # UFO_ANTHROPIC_API_KEY, UFO_OPENAI_API_KEY (bare ANTHROPIC_API_KEY is REFUSED)
make build                                  # cargo builds the client (cargo is installed)
make init EMAIL=you@x.com                   # workspace + token at ~/.ufoctl/token
make serve                                  # http://localhost:8710
mkdir -p ~/.ufo && install -m 600 ~/.ufoctl/token ~/.ufo/credentials && echo http://localhost:8710 > ~/.ufo/workspace
./client/target/debug/ufo "what can you do?"
uv run ufoctl ingress                       # serve agent-built sites at *.ufo.localhost:8100
```

## Extend it: "everything is an extension"
A Python package that imports only `ufo.sdk` and declares an entry point:
```toml
[project.entry-points."ufo.extension"]
acme = "ufo_ext_acme.manifest:manifest"
```
The manifest can declare tools (`ToolDef`), jobs, routes, credential slots, connectors, subagent
profiles, model providers, sandbox carriers, memory/search providers, skills, and hooks.
- Smallest real example: `extensions/perplexity/ufo_ext_perplexity.py` (437 lines incl. tests).
- Full surface: `extensions/sample`. Manage with `ufoctl ext search|install|remove`.
- **Existing `extensions/gbrain`** syncs a GitHub repo's markdown as pages. Other built-ins: `mcp`,
  `composio`, `browserbase`, `openrouter`, `rag`, `sites`, `scheduled_tasks`, `skill_create`, `research`, `memory`.
- A River-trained model could plug in as a **model provider extension**, since River serves an
  OpenAI-compatible endpoint (see `extensions/openrouter` for the pattern).
