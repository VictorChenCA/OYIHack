# Memorable: procedural memory for agents (YC)

**Side quest prize:** "Most Memorable: the most interesting/innovative use case of Memorable." **Prize: Memorable Pro, bomber jackets, AirPods, cash.** All tracks are in `kb/EVENT.md#prizes`.

**What it is:** it watches an agent's successful runs as tool-call traces and extracts a
**deterministic procedure** (ordered steps, pre/postconditions, verify command). The extraction is
model-free. On the next similar task, it injects that procedure (about 50–100 tokens) as reference
data. It stores **how** a task got done, not facts.
Measured: 19% fewer turns on gbrain/Claude Code, 40% fewer tool calls on QM/Codex, and 293 tokens
versus 15.6K for an equivalent skill.

- Site/docs: https://www.memorable.sh/doc · Dashboard (keys, connectors): https://memorable.sh/dash
- Local scraped docs: `kb/raw/memorable-{llms.txt,doc,cli,api,integrate,gbrain,qm,usecase}.md`
- Claude plugin source: github.com/MemorableOrg/cowork-plugin

## From the kickoff talk (Miguel, co-founder)
- Memorable started at a hackathon. It stores the steps of a task **in a graph**, so the next similar task runs
  "faster, cheaper and more deterministic." Live on **QM, gstack, and GBrain**. Bring your own environments and browsers.
- **What they judge:** "think really big... change how agent computation is done on a specific environment"; "something
  super interesting about how to change the way agents are thinking using Memorable **on a specific domain**."
- Prizes (spoken): **1st AirPods Pro + $500, 2nd $250, 3rd $100** (the slide adds Memorable Pro and bomber jackets).

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

## Setup status + proof (Sep 27, 15:15), shared environment "Main" `c8241748-81a9-4dd3-b4aa-60d456355a4a`
- CLI **0.5.31-shared-env.1** (pinned build from the dashboard), signed in. The key lives only in `~/.memorable/config.json`.
  Local backend, consent read-write. Project hook in the committed `.claude/settings.json` (UserPromptSubmit: recall + capture) plus
  `env.MEMORABLE_ENVIRONMENT_ID`. **Every explicit CLI call needs `--environment c8241748-81a9-4dd3-b4aa-60d456355a4a`.**
- ✅ **Explicit ingest stores:** `memorable ingest - --environment <id>` returned `stored …_w01-explicit in environment …, version 5a73e6ca…`.
- ✅ **Shared recall** works from a fresh process (`env -i`): `memorable recall --environment <id> --json "<task>"`, corpus_count 1.
- ✅ **Automatic injection:** a related task B got the procedure injected before the model acted (1 guarded block in its
  transcript), and B's check passed (8/0). The secret sentinel was scrubbed to `<secret>`, and home paths became `~`.
- ✅ `MEMORABLE=0` turns the hook off (it returns `{}`).
- ❌ **Automatic hook CAPTURE didn't store.** The workflow closed and was extracted, but nothing was stored, and `memorable doctor` shows
  `api auth: extract 409`, which was reported to Memorable. **So C&C must record runs itself** with `memorable ingest - --environment <id>`
  (the recipe above), using the real hook stream. Don't rely on the hook to capture.
- Unverified: a read-only key (create one in the dashboard to test it) and cross-environment denial (no second environment's credentials).
- Field roles (project=filter, task=semantic, verification=context) are dashboard config. The CLI exposes no metadata filter,
  so treat them as a capability gap, not a working feature.

## C&C integration recipe (Sep 27, 14:55): record from C&C's hook stream, recall on spawn
**Status:** consent is enabled (read-write, local store `~/.memorable/procedures.jsonl`). **The extraction API still needs the
human to run `memorable login` in a browser**; until then, ingest fails.
- **Record (the gap in PLAN.md S4, which only has recall):** on a unit's `Stop` with a successful last step, C&C builds a
  trace from the PreToolUse/PostToolUse(+Failure) events it already has, and pipes it to `memorable ingest -`.
  Any unit's success then becomes a charted lane for every unit, with no per-worktree hooks. This is the "Most Memorable" pitch.
  ```json
  {"session_id":"<claude session_id>","harness":"cnc","task_description":"<first line of the mothership prompt, ≤200 chars>",
   "tool_calls":[{"name":"Bash","input":{"command":"Bash command=bun test"},"result":{"ok":true}}, ...]}
  ```
  Kit gotchas that make ingest silently store nothing:
  1. **Only `input.command` reaches the extractor.** Encode every step as a `"Tool key=value"` string in `input.command`
     (for example `"Edit file_path=src/x.ts"`, `"Read file_path=README.md"`, or the Bash command itself).
  2. **The last step must be a command marked `ok: true`**, or the trace is refused as `no_postcondition`.
  3. Identifiers only. No file text, summaries or timestamps in commands (they get truncated and split procedures).
  4. Include `result` only when the outcome is known (PostToolUse → ok, PostToolUseFailure → not ok).
  5. Never `memorable forget --yes` (it wipes consent for the whole machine).
- **Recall (charted lane vs fog):** on spawn, run `memorable recall "<task>"`. A hit means charted (known ETA and a veteran badge),
  a miss means frontier (fog). `memorable list --json` feeds a procedures counter. `memorable show` prints prose, so parse the step
  lines with a regex if you need them.
- **Demo seeding:** run the same small demo task twice before recording. The first run goes into the fog and gets ingested; the second
  run recalls it and travels a charted lane.

## ★ Official hackathon kit: `kb/repos/memorable-hackathon-kit` (github.com/MemorableOrg/memorable-hackathon-kit, pushed Sep 27)
- `PROMPT.md` is the ONE prompt to paste into the agent that builds your project. It adds recall,
  replay, and record. A headless Claude Code agent integrated it in 6 min / $0.69.
- `builds/0{1..4}-*/agent.mjs` are reference integrations (coding, home, browser, research agents),
  about 40 lines each: `recall(goal)` → `stepsOf(ref)` → `replay(steps)` → `record(goal, history)`.
- `eval/run.mjs <app-dir> "<task>"` runs a task cold, then warm, and prints turns, tool calls, and
  cost. **This is your before/after demo number.**
- Dashboard routes: memorable.sh/dash → Environments (agent prompt + key), Connect (claude.ai/Cowork
  connector), Account (key for a hosted service). Teams: one environment, invite by email.

### Gotchas learned by the kit's authors (these override the API docs where they differ)
1. The trace must END in a command step marked ok, or it is refused as `no_postcondition`.
2. **Only `input.command` reaches the extractor.** Encode every step as a `"tool key=value"` string in `input.command`.
3. Keep volatile values (summaries, note bodies, file text) out of commands. They split procedures,
   and long lines get truncated and can't be replayed. Use identifiers only.
4. `memorable show` prints prose, so replay has to parse step lines with a regex.
5. Bare `memorable login` inside an agent never finishes. Use `echo 'mk_…' | memorable login --paste`.
6. **Never run `memorable forget --yes`.** It wipes consent for the whole machine.
7. **Claude Code auto mode may refuse the key line or `memorable enable` as exfiltration.** Approve it
   once, or add `Bash(memorable:*)` to your permission allowlist.
8. `show <slug>` "not found" for `procedures/…` slugs is fixed in 0.5.31 (npm latest was 0.5.30 on Sep 27; pass the full slug).
