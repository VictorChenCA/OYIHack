# Superset: run many coding agents in parallel (superset.sh)

**Side quest prize:** "Best Agent Swarm: the most impressive project built by running many coding agents in parallel with Superset. **Presented with Superset Pages.**" **Prize: AirPods Max + a year of Superset Pro.** All tracks are in `kb/EVENT.md#prizes`.

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

## Pages (REQUIRED for the Superset side quest: "Presented with Superset Pages")
Docs: grep `Source: https://docs.superset.sh/pages` in `kb/raw/superset-llms-full.txt`.
A Page is a self-contained HTML file, or a dir with `index.html` plus assets, published to a shareable URL.
```bash
superset pages publish demo.html --title "OYI demo" --label "v1" --visibility everyone   # prints the URL
superset pages publish demo.html --label "v2: after feedback"   # same path + same workspace = new version, same link
```
- **Use `--visibility everyone` for judges and the submission form** ("anyone with the link", no sign-in).
  The default is `org`, which judges can't open. Republishing keeps the visibility.
- Desktop: **Pages** tab → **Create with AI**, or ask an agent in a workspace to "publish it as a Superset
  Page". The Superset plugin ships a Pages skill.
- Comment loop: teammates pin comments to page elements, and the agent watching the page (the one that
  published from a Superset terminal) gets them, edits, republishes and replies. Keep the host and that
  agent session running.
- Swarm-demo idea: have the orchestrator agent publish a Page that shows the swarm's work (tasks, workspaces,
  diffs, timings), and put that Page link in the submission's "anything else" field.

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
