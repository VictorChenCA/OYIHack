# QM (Y Combinator): multiplayer agent harness for work

**Side quest prize:** "Fork QM and make it do something new! Push the harness in any direction." (It must be a real fork of `yc-software/qm`.) All tracks are in `kb/EVENT.md#prizes`.

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

## From the kickoff slide: "Extend QM" examples (Sep 27)
The slide's suggested directions (repo: https://github.com/yc-software/qm):
- **Have QM play a video game** (SimCity, Dota, Minecraft, etc.)
- **Build what you wish Codex/Claude Cowork could do**
- **Agent coordination/swarms**
- **Novel UX (RTS?)**, i.e. commanding agents like units in a real-time strategy game
- **Multiplayer**
- **QM computer use**

What the demo screenshots showed QM doing at YC (a sense of the product's "home turf"):
- Web UI at `qm.yc*.com`: Home / Search / Browse / Create New Chat, with sessions grouped as
  Personal, QM-Demo, QM-DEV. Chats run side by side in panes.
- **Spreadsheet ops from chat:** "tracking invitations for the fall founder dinners in a sheet, one tab
  per restaurant. Go through the RSVP reply threads and fill in names, emails and current status."
  QM reconciled **234 invites** across six restaurant tabs and attached a populated CSV. Another pane
  built a "Q2 2026 FV changes" table joined against the portfolio.
- **Slack → instant internal web apps:** Steve asked for "the top students confirmed for Startup School
  in these categories: the weirdest, wildest moonshot projects, and students interested in defense."
  QM shipped **two live apps shared org-wide** ("anyone signed in at YC can open them"), e.g.
  `qm.apps.yc/d/sus2026-moonshots/`. Two minutes later a follow-up, "can you add a filter by
  school?", added the filter to both apps plus a "wildness" sort. **Scoped web apps, built and
  iterated from a Slack thread, are QM's signature move**, so a hack that builds on this lands well.

## Run options (ranked by speed)
1. **Hosted QM on agent37 with the hackathon credit:** redeem at **https://www.agent37.com/redeem/QMHACK** (code `QMHACK`,
   from the kickoff slide's QR code). The page is "Claim your credit | Agent37" and it's client-rendered,
   so the credit amount isn't in the KB; check it after signing in. Then launch hosted QM at
   https://www.agent37.com/qm (the 3rd-party host linked from QM's README). You get zero-infra access to the product.
   - agent37 is also a **built-in QM sandbox backend**, so a *forked* QM (local dev-instance) can run its
     per-scope sandbox computers on agent37 instead of local Docker:
     `SANDBOX_BACKEND=agent37` + `AGENT37_API_KEY` (optional: `AGENT37_API_BASE_URL`, `AGENT37_TEMPLATE`,
     `AGENT37_CPUS`, `AGENT37_MEMORY_GB`, `AGENT37_DISK_GB`, `AGENT37_EGRESS_PROXY_URL`, `AGENT37_NAME_PREFIX`).
     Code: `kb/repos/qm/src/sandbox/agent37-sandbox.ts`, config in `src/config.ts` (`agent37SandboxEnv`).
     Useful if Docker is the blocker. Unverified: whether the QMHACK credit covers API sandbox usage.
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
