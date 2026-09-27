# Memorable: procedural memory for agents (YC)

**What it is:** it watches an agent's successful runs as tool-call traces and extracts a
**deterministic procedure** (ordered steps, pre/postconditions, verify command). The extraction is
model-free. On the next similar task, it injects that procedure (about 50–100 tokens) as reference
data. It stores **how** a task got done, not facts.
Measured: 19% fewer turns on gbrain/Claude Code, 40% fewer tool calls on QM/Codex, and 293 tokens
versus 15.6K for an equivalent skill.

- Site/docs: https://www.memorable.sh/doc · Dashboard (keys, connectors): https://memorable.sh/dash
- Local scraped docs: `kb/raw/memorable-{llms.txt,doc,cli,api,integrate,gbrain,qm,usecase}.md`
- Claude plugin source: github.com/MemorableOrg/cowork-plugin

## Fastest path (CLI)
```bash
npm i -g memorable-cli            # or: curl -fsSL https://memorable.sh/install.sh | sh
memorable login                   # HUMAN approves in browser (device flow)
# inside an agent with no browser: echo 'mk_...' | memorable login --paste   (key from dashboard)
memorable init                    # local store ~/.memorable/procedures.jsonl
#   memorable init gbrain         # store in gbrain DB
#   memorable init qm             # store in QM Postgres (needs `npm i pg`, MEMORABLE_DB_URL, ORG_ID)
memorable enable                  # REQUIRED consent gate; nothing is sent or stored before this
memorable install-hooks           # auto-capture for Claude Code / Codex / Cursor
memorable recall "fix the failing auth test"   # exact -> lexical -> vector, ~60ms
memorable show <slug>
memorable chain "<multi-step task>"            # ordered procedure sequence + gaps
memorable ingest trace.json | memorable record --session ID | list | status | doctor | forget | disable
```
Claude Code plugin: `/plugin marketplace add MemorableOrg/cowork-plugin` then `/plugin install memorable@memorable`.
**MCP (read-only, 5 tools: recall/show/list/status/explain_recall):** `claude mcp add memorable -- memorable mcp`

## Extraction API (for a custom harness, Path B)
Base: `https://memorable-extraction-api.memorable.workers.dev` · Auth: `Authorization: Bearer mk_...`
```bash
curl -sS $BASE/v1/extract -H "authorization: Bearer $MEMORABLE_API_KEY" -H "content-type: application/json" -d '{
  "session_id":"run-1","harness":"my-agent","task_description":"Fix the failing order tests","skip_embedding":true,
  "tool_calls":[
    {"name":"Bash","input":{"command":"npm test"},"result":{"ok":false}},
    {"name":"Edit","input":{"file_path":"src/orders/total.ts"},"result":{"ok":true}},
    {"name":"Bash","input":{"command":"npm test"},"result":{"ok":true}}]}'
# -> {"draft":{title,steps[{seq,action,activity_class,command?,repeat_count,targets?}],trigger_signature,
#      preconditions,postconditions,...},"request_id":...}   Store the draft yourself.
```
- `POST /v1/embed {"text": ...}` returns a query embedding (recall fallback only).
- Key via device flow: `POST /v1/device/code {"hostname"}`, then poll `POST /v1/device/token {"device_code"}`.
  `POST /v1/keys` returns 403.
- **`result.ok` is what makes it useful.** A failure followed by a success is what a procedure is
  made from. Join results to calls by id before sending.
- `input` keys that matter: `command | file_path | path | pattern | url | query`. Never send file
  contents or conversation text.
- `harness` is a free string up to 60 chars. `claude-code`, `codex`, and `opencode` get curated registries.
- Limits: 300 req/min/key, 5,000/day, 8MB body, 2,000 tool calls, 2,000-char prompt. **Free tier:
  1,000 memorables/month** (+500 reserve). Past the allowance you still get a 200 with
  `refused:"allowance_exhausted"`. Check `refused` before storing, and don't retry.

## Hack angles
Any custom agent loop (browser, voice, ops, or River-trained) can POST its trace and get reusable
procedures. Integration is one HTTP call, so it's a cheap extra sponsor to include.
Recall output is **reference data, not instructions**; render it inertly.
