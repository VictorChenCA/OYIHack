Source: https://www.memorable.sh/doc



Docs: Procedural Memory For Agents | Memorable

DOCSUSE-CASECASE STUDIES
BOOK A CALLDASHBOARD

01DOCS02USE-CASE03CASE STUDIES
BOOK A CALL

DocumentationSections

Getting started

OverviewQuickstartAGENTS.md
CLI
Command reference
API
Extraction API
Integrations

Any harness
gbrain
QM
Memorable
An agent finishes a task; Memorable stores how it was done and replays it when a similar task returns. Storage stays on your side and consent is fail-closed.

$npx memorable-cli@latest login
$memorable enable
$memorable recall "fix the tests"
QUICKSTART

$ npx memorable-cli@latest login
$ memorable enable
$ memorable recall "fix the tests"

Store your first procedure
Sign in, give consent, recall. Three commands.

Claude CodeCodexCursoryours

Wire up your harness
Claude Code, Codex, gbrain, QM, or yours. The harness field is any string.

Claudememorable

Connect Claude
One link, pasted into Claude. No terminal, nothing installed.

$ memorable recall "auth tests"
exactmiss
lexical0.86 hit
semantic0.79

How recall finds it
Exact, then lexical, then a vector. A reworded ask still lands.

POST /v1/extract
tool_calls[]→

procedure
steps[]

One endpoint
POST the tool calls, get a procedure back. Same trace, same steps.

memorable init this machine
memorable init gbrain your gbrain db
memorable init qm QM postgres

Keep the store yours
This machine, your gbrain database, or QM Postgres.

agent turns-19%

What it saves
19% fewer agent turns, replicated.

Pick your route
Four ways in. Each one ends with this machine signed in and recording. Nothing below asks an agent to open a browser.

A coding agent on a repo
Claude Code, Codex, Cursor, Devin, Antigravity.
npx memorable-cli
Picks the agent, asks whether to make a page for this project, opens one tab, you press Approve. Hooks and consent are written for you.

Your own agent
Browser, voice, smart home, research, ops.
memorable.sh/dash, Environments, Connect
Pick the card, Save, Copy prompt. The key is already in it. Paste it into the agent that builds your project; it adds recall, replay and record.

No terminal
claude.ai, Cowork, Claude desktop.
memorable.sh/dash, Connect, Create a connector
Add the link under Connectors in Claude. It searches memorables before it plans and records when it finishes.

A server with no Node
A backend that runs agents.
memorable.sh/dash, Account, New key for an agent
POST /v1/extract with the key. Store the draft on your side.

Quickstart
Two minutes. Signing in links this machine to your workspace; the default backend is a standalone local store, and on a machine running gbrain you can point it at your own database with memorable init gbrain afterwards.

connect this machineCopy

>npx memorable-cli# picks your agent, one tab to approve, hooks and consent written
>memorable status# extraction api should read configured

no node or npm on this machineCopy

>curl -fsSL https://memorable.sh/install.sh | sh
># then: memorable start

store a procedure, then find itCopy

>memorable ingest trace.json
>memorable recall "rotate the TLS cert"

>memorable show <slug># guarded, injection-safe rendering

>memorable list# everything stored, newest first

For agents
Telling a coding agent "use memorable" is enough. Every step is a plain CLI call it can run itself. The drop-in file lives on AGENTS.md.

one lineCopy

>memorable agents-md >> AGENTS.md
Measured
Against the same tasks run without memory, on two independent runs.

Recall vs no recallCopy

```
agent turns -19%, replicated
pass rate every run passed
injected size ~293 tokens
vs a 15,593-token skill: 0% turns
```

Extraction API
One endpoint converts a tool-call trace into a procedure. Full reference on the API page.

POST /v1/extractCopy

```
BASE=https://memorable-\
extraction-api.memorable.workers.dev

curl $BASE/v1/extract \
 -H "Authorization: Bearer \
$MEMORABLE_API_KEY" \
 -H "Content-Type: \
application/json" \
 -d '{
 "session_id": "run-183",
 "task_description": 
"rotate the TLS cert",
 "harness": "my-orchestrator",
 "tool_calls": [
 {"name": "shell",
 "input": {"command": 
"certbot renew"},
 "result": {"ok": true}}
 ]
 }'
```

Response · 200Copy

```
{
 "draft": {
 "title": "Rotate the TLS cert",
 "schema_version": "1.0.0",
 "steps": [
 {
 "seq": 1,
 "action": "shell",
 "activity_class": "execute",
 "command": "certbot renew",
 "repeat_count": 1
 }
 ],
 "postconditions": [
 "final command exited 
successfully: certbot renew"
 ],
 "embedding": [],
 "embedding_model": ""
 },
 "request_id": "82886df0-..."
}
```

On this page

Overview
Features
Pick your route
Quickstart
For agents
Measured
Extraction API

memorable/ˈmɛm(ə)rəb(ə)l/adj1not to be forgotten; remarkable.2easy to remember; recalled without effort.info@memorable.sh

Quick Links
HomeDocsDashboard

Use Cases
Coding agentsBrowser agentsComputer useVoice agentsResearch agentsOps agents

Company
Case Studies

Research With AI
Ask ChatGPTAsk ClaudeAsk Perplexity

© 2026 Memorable. All rights reserved.
Website By Lumina
Terms & ConditionsPrivacy Policy