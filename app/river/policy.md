# C&C triage policy (the Sentinel's labeling rules)

The teacher labels every blocker by these rules. The Sentinel is trained **without** seeing them: its prompt holds only
the blocker, the field question and the code legend, so it has to learn the policy from the labels.

A blocker = one Claude Code hook event (`PermissionRequest`, `Notification`, `StopFailure`, `Stop`) + the unit's task
+ the agent's last message. Five typed fields:

| Field | Labels |
|---|---|
| `kind` | credential, account, approval, rate_limit, billing, missing_info, dependency, failure |
| `quadrant` | do_now, schedule, delegate, drop |
| `human_only` | yes, no |
| `department` | engineering, marketing, product_design, arts |
| `tier` | haiku, sonnet, opus, fable |

## kind
- **credential**: a missing, invalid or expired API key, token or secret (`authentication_failed`, "I need a GITHUB_TOKEN").
- **account**: the agent must sign up for / get access to an external account or console (X, TikTok, Instagram,
  LinkedIn, app stores, vendor dashboards).
- **approval**: a permission prompt (`PermissionRequest`, `Notification: permission_prompt`) for a tool call.
- **rate_limit**: `rate_limit`, `overloaded`, HTTP 429, "slow down", quota-per-minute errors.
- **billing**: `billing_error`, HTTP 402, credits exhausted, card declined, plan limit that needs an upgrade.
- **missing_info**: the agent waits for a human answer or decision (`idle_prompt`, `agent_needs_input`, a question).
- **dependency**: the agent waits on another unit's or department's output.
- **failure**: failing tests, type errors, build or deploy failures, crashed migrations.

## human_only (yes = gold enemy)
- **yes** for anything needing a **phone number, CAPTCHA, payment, signing terms, legal identity, or entering a secret**.
- credential → yes (a human puts the secret in `.env`; secrets never enter C&C).
- billing → yes (payment).
- account → yes. Signups on X, TikTok, Instagram or LinkedIn are always human-only: their terms ban automated signups.
- approval: **destructive or external-facing** actions (push, deploy, publish, post, send, delete, drop, merge,
  refund, pay) → yes; read-only or local, reversible actions → no.
- missing_info → no, unless the answer is a legal identity, payment detail or signature (→ yes).
- rate_limit, dependency, failure → no.

## quadrant (urgent × important)
- credential → **do_now**. billing → **do_now**.
- rate_limit / overloaded → **delegate** (wait and retry).
- approval: read-only/local → **delegate**; destructive/external → **schedule**.
- dependency → **schedule**.
- account → **schedule**, or **do_now** if a deadline is mentioned.
- missing_info: nothing specific → **drop**; a concrete question → **schedule**; any deadline → **do_now**.
- failure → **schedule**, or **do_now** if it breaks main, production, a release, or a deadline is mentioned.

## department
- Cues: code, PRs, CI, APIs, databases → **engineering**; posts, launch copy, outreach, email, ads → **marketing**;
  UX, landing page, flows, mockups, onboarding → **product_design**; logo, brand, images, video, music → **arts**.
- Default: the department of the unit's own task.
- failure → always **engineering** (someone has to fix the build), even on a marketing site.
- dependency → **the department being waited on**, not the waiting unit's.

## tier (the best Claude unit class to send)
- Default: by the complexity of the underlying work. Trivial or lookup → **haiku**; routine implementation or writing
  → **sonnet**; complex multi-file work or strategy → **opus**; the hardest reasoning and long horizon → **fable**.
- rate_limit → **haiku** (wait and retry).
- missing_info with nothing specific → **haiku**.
- failure → **sonnet**, or **opus** if architectural (cross-module, schema, concurrency, circular dependencies).
- dependency → the complexity of the deliverable being waited on.
