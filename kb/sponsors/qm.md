# QM (Y Combinator): multiplayer agent harness for work

**What it is:** a self-hosted, **multiplayer** agent harness for startups, used from Slack and the web.
- Every person and every room (channel, group DM, project) gets an isolated **scope**. Each scope has
  its own memory, files, keychain view, permissions, crons, web apps, skills, and a **durable sandbox
  computer**.
- Harness-agnostic: Pi, OpenCode, Codex, and Claude Code all drive the same core.
- Stack: TypeScript on Node (Fastify), Postgres, Lit/Vite web UI, Slack Bolt plugin.

- Site: https://qm.ycombinator.com · Repo: https://github.com/yc-software/qm (local: `kb/repos/qm`)
- Hosted 3rd-party QM (fastest way to *use* it): https://www.agent37.com/qm
- **Read locally:** `README.md`, `docs/*.md` (memory-providers, mcp-connectors, skill-registry,
  swarms, session-sharing, files-publication, composio, model-gateway), `cli/README.md`, `SECURITY.md`, `adrs/`

## Run options (ranked by speed)
1. **Hosted instance from the sponsor / agent37.** Ask at kickoff. You get zero-infra access to the product.
2. **Local dev instance** (from a clone):
   ```bash
   cd kb/repos/qm   # or a fresh clone. REQUIRES Node >= 24.15 (repo pins 24.18.0), npm >= 11.10, Docker running
   export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
   npm install && cp .env.example .env   # set ANTHROPIC_API_KEY (or OPENAI/OPENROUTER), HARNESS=pi|claude-code|codex
   npm run dev-instance:web              # core + web UI + local Postgres + local Docker sandbox (SANDBOX_BACKEND=local)
   npm run dev-instance:status | dev-instance:down | dev-instance:doctor
   ```
   Plain `npm run dev` runs core only. Without `DATABASE_URL` + `SESSION_STORE=postgres`, sessions are in-memory.
   Skill: `kb/repos/qm/.claude/skills/dev-instance/SKILL.md`.
3. **Real deploy** (`qm init . --org <slug> --target fly|aws`, then `qm up`). **Too slow for a 4h hack**:
   it needs an operator cloud account, billing, and Resend/SMTP for sign-in.

## Extension seams (where "extend QM" hacks plug in)
| Seam | How | Doc |
|---|---|---|
| **External memory provider** | `MEMORY_PROVIDER_CONFIG` JSON routes scopes (`personal/channel/group/team/org`) to `{type:"mcp", url, read:{tool}, write:{tool}}`. Capture modes: `off / explicit / automatic`. OAuth client-credentials per read/write. Fail-open by default. | `docs/memory-providers.md` |
| **Memorable procedures** | provider `{"id":"procedures","type":"memorable"}` records traces with `memorable record` and injects with `memorable inject`. Needs memorable-cli ≥ 0.5.9 | same |
| **MCP connectors** | `PUT /v1/admin/mcp-servers/:id` with `{name,url,auth,credentialScope:"shared"|"per-user",readOnly,enabled}` | `docs/mcp-connectors.md` |
| **Sandbox tools & skills** | deployment dir `sandbox/tools/<id>/tool.json` + binary; `sandbox/skills/<id>/SKILL.md` | `docs/deploy-directory.md`, `docs/skill-registry.md` |
| **Plugins/services** | deployment dir `plugins/` | `docs/combined-services.md` |
| **Swarms** | root session coordinates worker sessions (multi-agent) | `docs/swarms.md` |
| **Published web apps / files** | agent-built internal apps shared to scopes | `docs/files-publication.md` |
| **Composio** | app-specific skills + accounts | `docs/composio.md` |

**GBrain as QM org memory** (probably the highest-leverage "extend QM + GBrain" demo): run
`gbrain serve --http` and register it as an `mcp` provider for the `org`/`channel` scopes, with
`read.tool: "recall"` and `write.tool: "remember"`. Check the arg names with `gbrain protocol --json`
and map them with `queryArg` / `contentArg`.
Note: QM providers authenticate **only with OAuth client credentials** (no static bearer).
`gbrain agent register` / the GBrain OAuth server provides those.

## Security postures (for the demo narrative)
Posture is `strict | auto (default) | dangerous`. Sharing is `isolated (default) | open`.
The command policy (denies recursive deletes, destructive SQL) applies in every posture.
