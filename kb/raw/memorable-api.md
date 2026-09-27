Source: https://www.memorable.sh/doc/api


Copy Page
Extraction API
The Extraction API converts an agent's tool-call trace into a replayable procedure. The parse is deterministic and model-free: the same trace gives the same steps, in the same order, with the same classification.
The API is not stateless. A key that belongs to a workspace writes one row per prompt, carrying the prompt text, and one row per admitted procedure. The corpus is never sent and never stored, and request bodies are never logged.

Agent prompt, everything an integrating agent needsCopy

```
You are integrating a harness or agent with the Memorable Extraction API.
Base URL: https://memorable-extraction-api.memorable.workers.dev

1. Get a key once: keys belong to a workspace, so a human has to sign in.
 POST /v1/device/code with { "hostname": "..." } -> { user_code, verification_uri,
 device_code, expires_in, interval }. Show the user the code and the URL, then poll
 POST /v1/device/token with { device_code } every `interval` seconds until it returns
 { "status": "approved", "api_key": "mk_..." }. STOP and ask your human to approve it;
 you cannot complete a browser flow. Store the key; send it as
 "Authorization: Bearer mk_...". POST /v1/keys is closed and returns 403.
2. After each finished session, POST /v1/extract with:
 { "session_id": "<stable id>", "harness": "<your harness name, any string>",
 "task_description": "<one line: what the task was>", "skip_embedding": true,
 "tool_calls": [ { "name": "<tool>", "input": { "command"|"file_path"|"path"|
 "pattern"|"url"|"query": "<string>" }, "result": { "ok": true|false } |
 { "exit_code": 0 } } ] }
 Send ONLY these fields. Do not send conversation text, file contents, or
 credentials; include "result" only when the outcome is actually known.
3. Response: { "draft": { title, steps[{seq, action, activity_class, command?,
 repeat_count, targets?, creates?}], trigger_signature{entities, search_text}, preconditions,
 postconditions, ... }, "request_id": "..." }. The parse is deterministic and
 model-free, so identical input yields identical steps; the title alone is
 written by a small model and is not byte-stable. Store the draft yourself, on
 the user's side. The service keeps the task_description line and the extracted
 steps so the dashboard can render them; it does not keep the corpus.
4. Past the monthly allowance the API REFUSES. Still 200, still carrying the
 draft, plus refused: "allowance_exhausted" and a detail sentence. Nothing is
 stored on either side: check for `refused` before you store, and do not retry.
5. Errors: 401 unauthorized, 400 invalid_json/invalid_request, 413 over 8MB,
 429 rate_limited (300/min per key). Every response carries request_id;
 include it when reporting problems.
```

Base URL: https://memorable-extraction-api.memorable.workers.dev
Authentication
Every request requires a bearer token in the Authorization header. Requests without a valid token return 401. Keys look like mk_… and are issued through the device flow above. The key itself is never stored: only a SHA-256 hash of it is.

Authorization headerCopy

```
Authorization: Bearer $MEMORABLE_API_KEY
```

Get a key
POST /v1/device/code
Keys belong to a workspace, so getting one means signing in. The CLI does it for you: memorable login starts a device authorization (RFC 8628), prints a short code, waits while you approve it in a browser, and saves the key to ~/.memorable/config.json.

Device authorizationCopy

```
curl -X POST https://memorable-extraction-api.memorable.workers.dev/v1/device/code \
 -H "Content-Type: application/json" -d '{"hostname":"my-laptop"}'
```

Response: user_code, verification_uri, device_code, expires_in, interval. Poll POST /v1/device/token with device_code every interval seconds until it returns status approved and an api_key. A bodyless or malformed request to either endpoint returns 400 invalid_json. POST /v1/keys is closed on this deployment: it always returns 403 anonymous_keys_disabled, sign in with memorable login instead. GET /v1/usage/me is internal to the CLI's own status checks, not a public endpoint.
Create a procedure
POST /v1/extract
Converts a trace into a ProcedureDraft. Any harness is accepted: known harnesses (claude-code, codex, opencode) get curated activity registries; every other harness string is served by a generic tier that still infers execution from command-shaped input.

POST /v1/extractCopy

```
curl https://memorable-extraction-api.memorable.workers.dev/v1/extract \
 -H "Authorization: Bearer $MEMORABLE_API_KEY" \
 -H "Content-Type: application/json" \
 -d '{
 "session_id": "run-183",
 "task_description": "rotate the TLS cert for api.example.com",
 "harness": "my-python-orchestrator",
 "tool_calls": [
 {"name": "shell",
 "input": {"command": "certbot renew"},
 "result": {"ok": true}},
 {"name": "shell",
 "input": {"command": "nginx -s reload"},
 "result": {"ok": true}}
 ]
 }'
```

Response · 200Copy

```
{
 "draft": {
 "title": "rotate the TLS cert for api.example.com",
 "session_id": "run-183",
 "schema_version": "1.0.0",
 "steps": [
 { "seq": 1, "action": "shell", "activity_class": "execute",
 "command": "certbot renew", "repeat_count": 1 },
 { "seq": 2, "action": "shell", "activity_class": "execute",
 "command": "nginx -s reload", "repeat_count": 1 }
 ],
 "postconditions": [
 "final command exited successfully: nginx -s reload"
 ],
 "embedding": [],
 "embedding_model": ""
 }
}
```

Embed a query
Query-side embedding for recall. Used only as a fallback: recall tries exact and lexical matching locally first (zero tokens, zero network).

POST /v1/embedCopy

```
curl https://memorable-extraction-api.memorable.workers.dev/v1/embed \
 -H "Authorization: Bearer $MEMORABLE_API_KEY" \
 -H "Content-Type: application/json" \
 -d '{"text": "rotate the TLS cert"}'
```

Errors
Errors return JSON with an error code and, where useful, a detail message.

StatusCodeMeaning
401unauthorizedMissing or invalid bearer token.
400invalid_requestMissing session_id or tool_calls.
413payload_too_largeBody over 8 MB.
429rate_limitedOver the 300-per-minute per-key limit.
429quota_exceededOver 5,000 requests for the day on this key.
400invalid_jsonRequest body isn't valid JSON.
403anonymous_keys_disabledPOST /v1/keys is closed; sign in with memorable login instead.
Rate limits
300 requests per 60 seconds per API key, enforced at the edge, and 5,000 requests per key per day. A body is capped at 8 MB and 2,000 tool calls, and the prompt at 2,000 characters. The free allowance is 1,000 memorables a month with a one-time reserve of 500 behind it.
Security
What is kept, and only this: a workspace key writes one workflows row per prompt and one procedures row per admitted procedure. The corpus is never sent.
Your database stays yours. The API never receives connection credentials.
Scrubbed input only. The CLI keeps twelve allow-listed argument fields, replaces credential-shaped strings, and sends nothing else.
Injection-hardened recall. Stored procedures are re-rendered as explicitly inert reference data before they ever reach an agent's context.

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
