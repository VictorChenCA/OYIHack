# Superset: run many coding agents in parallel (superset.sh)

**What it is:** a macOS desktop app plus CLI that runs Claude Code, Codex, OpenCode, Cursor Agent,
and others **in parallel, each in its own git worktree**. It has a status dashboard, diff viewer,
in-app browser, ports, PRs, automations (cron agents), remote hosts, mobile app, and "Pages"
(share agent-made reports). It's local-first: your keys and code stay on your machine.
Source-available (ELv2), free tier.

- Docs: https://docs.superset.sh · **Full docs mirrored:** `kb/raw/superset-llms-full.txt` (280KB; grep it)
- Any page as markdown: `https://docs.superset.sh/llms.mdx/<path>`
- Repo: https://github.com/superset-sh/superset (local: `kb/repos/superset`)

## Use it TODAY as your build tool (free sponsor usage)
- Desktop app: download from superset.sh. CLI: `brew install superset-sh/tap/superset`.
- Race agents: run the same prompt in 2–3 workspaces and merge the best (`recipes/race-agents`).
- Fan out: split the hack into independent slices, one workspace each (`recipes/fan-out-refactor`,
  `recipes/parallel-workstreams`).
- Orchestrate: the `superset:orchestrate` skill lets one Claude Code/Codex session coordinate workers via the CLI.

## MCP server (remote, OAuth)
```bash
claude mcp add superset --transport http https://api.superset.sh/mcp
```
Tools cover tasks (CRUD, statuses), workspaces (list/create/update/delete per host), **agents (launch
an agent session in a workspace)**, **terminals (create, send input, read screen)**, pages (publish,
comments), automations (create/run/pause), projects, hosts, and org members.

## TypeScript SDK (alpha)
```bash
npm i @superset_sh/sdk
export SUPERSET_API_KEY=sk_live_...  SUPERSET_ORGANIZATION_ID=...
```
```ts
import Superset from '@superset_sh/sdk';
const client = new Superset();                       // baseURL https://api.superset.sh, relay https://relay.superset.sh
const [host] = await client.hosts.list();            // needs the host daemon (desktop app, or `superset start`)
const projects = await client.projects.list({ hostId: host.id });
const r = await client.workspaces.create({ hostId: host.id, projectId, name: 'fix-auth', branch: 'fix/auth',
  agents: [{ agent: 'claude', model: 'sonnet', prompt: 'Implement X' }, { agent: 'claude', prompt: 'Write tests for X' }] });
await client.tasks.create({ title: 'Wire up auth', priority: 'high' });
await client.automations.run('<id>');                // trigger a cron agent on demand (e.g. from a webhook)
```
Never ship `sk_live_` keys to a browser; proxy them through a server.
Host must be online (relay tunnel) for workspace ops. Reference: grep `sdk/reference` in the llms-full file.

## Software-factory hack angle
A webhook, issue, or Slack message goes through the Superset SDK and spawns N agents in worktrees.
Memorable captures each successful run as a procedure. GBrain holds project knowledge. Automations
make it recurring.
