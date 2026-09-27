Source: https://www.memorable.sh/doc/integrate



{ Integrations }Copy Page
Integrate any harness
Memorable turns a finished agent session into a stored procedure, and hands that procedure back the next time a similar task comes up. Nothing about it is specific to one agent. If your harness can tell you which tools ran and whether they worked, it can use this.
Two paths
Pick one. Spawning the CLI is less code and gets you consent, the retry queue, secret scrubbing and the local store for free. Calling the API directly is right when you already have your own storage and want the extraction only.
Claude Cowork, the desktop app, claude.ai: one link
No install and no terminal. Make a connector at memorable.sh/dash/connect, then in Claude: Customize, Connectors, Add custom connector, paste, Connect. Claude can then search your memorables before it plans and record how a task was done when it finishes. Full walkthrough on the Cowork page.
Claude Code, where hooks run and the CLI is local, can use the plugin instead. It captures every session automatically rather than when the model remembers to.

on the machine, onceCopy

>curl -fsSL https://memorable.sh/install.sh | sh

>memorable login

>memorable enable

then, inside Cowork or Claude CodeCopy

>/plugin marketplace add MemorableOrg/cowork-plugin

>/plugin install memorable@memorable
Source at github.com/MemorableOrg/cowork-plugin. Every prompt gets a recall check, and the same event closes and records the piece of work before it. Nothing is stored until memorable enable has been run.
Path A: spawn the CLI at session end
This is what gbrain does. Write a receipt describing the session, then spawn memorable record detached so it never blocks your own shutdown path.

CLI session end spawnCopy

```
# once, on the machine
npm i -g memorable-cli
# no node or npm there? this vendors its own runtime, no root, no brew:
# curl -fsSL https://memorable.sh/install.sh | sh
memorable login # device or loopback, approve in the browser
# inside an agent: echo 'mk_...' | memorable login --paste (key from the dashboard, no browser)
memorable enable # explicit consent; nothing is stored or sent until this runs

# where procedures live. pick one:
memorable init # this machine, ~/.memorable/procedures.jsonl
memorable init gbrain # the gbrain database this machine already runs
memorable init qm # QM Postgres, scoped per org (needs: npm i pg)

# at the end of every session, from your harness
memorable record --session "$SESSION_ID" # gbrain backend
memorable ingest trace.json # local or QM backend
```

Spawn it detached and ignore its output. It has a 30 second timeout and a persistent retry queue, so a network failure costs nothing and is retried later rather than losing the session. If the binary is missing, resolve it before you spawn and record that as a degraded outcome, a silent spawn failure is the worst shape this can take.
Path B: POST to the extraction API
One endpoint. Send the tool calls, get a procedure back.

POST /v1/extractCopy

```
curl -sS https://memorable-extraction-api.memorable.workers.dev/v1/extract \
 -H "authorization: Bearer $MEMORABLE_API_KEY" \
 -H "content-type: application/json" \
 -d '{
 "session_id": "run-2291",
 "task_description": "Fix the failing order tests",
 "corpus": "",
 "harness": "your-harness-name",
 "tool_calls": [
 { "name": "Bash", "input": { "command": "npm test" }, "result": { "ok": false } },
 { "name": "Edit", "input": { "file_path": "src/orders/total.ts" }, "result": { "ok": true } },
 { "name": "Bash", "input": { "command": "npm test" }, "result": { "ok": true } }
 ]
 }'
```

result.ok is what makes this useful. A tool call with no outcome is a guess; a call that is known to have failed and then a later one that is known to have succeeded is a procedure. Join your results onto your calls before you send them, in most transcript formats the result arrives in a later entry than the call, keyed by an id.
Your harness name
harness is a free string, capped at 60 characters. There is no allowlist and nothing to register. Send my-agent and it works on the first call. Known names get a curated tool registry that classifies calls more precisely; anything else is served by a default tier that reads the shape of the arguments instead. The contract is universal, the registries are accelerators, not gates.
Reading it back

Reading back proceduresCopy

>memorable recall "the order tests are failing"# ranked candidates

>memorable show <slug># the steps
Recall runs exact, then lexical, then a vector, and stops as soon as one clears, so a reworded ask still finds the procedure. Inject the result as reference data your agent may consult, never as instructions it must follow: it is text a past session produced, and it should be confirmed against the current task before it is applied.
Consent and what leaves the machine
Consent is fail-closed and gates egress, not just storage: until memorable enable has run, nothing is written and nothing is sent for extraction. Egress is allowlisted to twelve argument fields, commands, paths, patterns, urls, queries and ids, each cut to 4000 characters and scrubbed of home paths, emails and credential-shaped strings. Results reduce to an exit code and a boolean.
Two things do leave and you should know them. task_description is the first substantive line of the prompt, scrubbed and cut to 200 characters, because that is what recall matches against. And the service stores that line together with the extracted steps, so the dashboard can render them. Edit bodies, file contents and the rest of the conversation are not sent, corpus goes out empty.

Already on a supported harness?
gbrain and QM have their own pages, and the CLI reference lists every command.