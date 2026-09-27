---
name: sprint-retro
version: 0.1.0
description: >
  End-of-cycle digest for one department of an agent-run company. Reads everything
  the department's agents wrote to the brain this cycle (company/<dept>/ pages),
  plus its open blockers, and writes one retro page (shipped, blocked, learned,
  next) to company/<dept>/retros/<date>. Then remembers exactly 3 durable facts
  so the next cycle's agents start from what this one learned. Replaces the
  30-minute Friday "what did we even do this week" meeting.
triggers:
  - "sprint retro"
  - "retro for"
  - "end of sprint"
  - "end of cycle"
  - "cycle digest"
  - "what did we ship"
  - "weekly digest for"
  - "department retro"
tools:
  - list_pages
  - get_page
  - search
  - recall
  - put_page
  - remember
mutating: true
writes_pages: true
writes_to:
  - company/
---

# Sprint Retro Skill

One retro page per department per cycle, built only from what is already in the brain.
Built for C&C (an RTS command center for Claude Code agent swarms), where each planet is a
department and one orbit is one cycle, but it works for any brain that files work under
`company/<dept>/`.

> **Filing rule:** retro pages go to `company/<dept>/retros/<YYYY-MM-DD>` (the cycle's end date).
> Follow `skills/_brain-filing-rules.md` for everything else.

## Contract

- Input: a department slug (`engineering`, `marketing`, `product-design`, `arts`, …) and optionally
  a cycle window (`since`, `until`). Default window: the last 7 days, ending now.
- Every bullet cites its source page inline: `[Source: <slug>]`. No claims without a page behind them.
- The retro has exactly four sections, in this order: **Shipped**, **Blocked**, **Learned**, **Next**.
- Blocked items name the blocker precisely (the account, key or approval) and who can clear it
  (`human` for gold/human-only blockers, `agent` otherwise).
- Exactly **3** facts are remembered at the end. Each must be durable (still true next cycle),
  specific, and not already in the brain (check with `recall` first).
- Idempotent: re-running for the same department and date overwrites that one retro page; it
  never creates a second one.
- Never edits or deletes the source pages it reads.

## Phase 1: Gather (read-only)

1. **List the cycle's pages.**
   `list_pages { prefix: "company/<dept>/", sort: "updated_desc", limit: 100 }`, keep pages updated
   inside the window, and drop `company/<dept>/retros/*` (don't retro the retros).
2. **Read them.** `get_page { slug, include_content: true }` for each (cap at 40; if there are more,
   read the 40 most recently updated and say so in the retro footer).
3. **Find open blockers.** `search { query: "<dept> blocked OR needs OR waiting on OR missing", limit: 20 }`
   plus `recall { query: "open blockers <dept>" }`. In C&C, blockers are the enemies on the map; if the
   caller passes an `open_blockers` list (id, title, reason, humanOnly, blockedUnits), use it verbatim.
4. **Last retro.** `get_page` the most recent `company/<dept>/retros/*` page if it exists, so **Next**
   from the last cycle can be checked off.

## Phase 2: Synthesize

Classify each source page into one bucket:

| Bucket | Goes in when the page… |
|---|---|
| Shipped | describes a finished deliverable (a file, a published page, a merged PR, a triage table) |
| Blocked | ends waiting on an account, token, approval, input or another unit |
| Learned | records a gotcha, a working command, a decision or a number worth reusing |
| Next | proposes follow-up work, or last retro's Next item is still open |

Rules:
- Merge duplicates (several agents often write the same finding). Keep the most specific wording.
- Last retro's **Next** items: mark each `done` (with the page that shows it) or carry it over.
- Rank **Blocked** by impact: human-only first, then by how many units/agents it blocked.
- Keep it short: at most 7 bullets per section. A retro nobody reads is worse than none.

## Phase 3: Write

`put_page` to `company/<dept>/retros/<YYYY-MM-DD>` with:

```markdown
---
type: retro
department: <dept>
cycle: <since> → <until>
sources: <n pages read>
---
# <Dept> retro · <cycle label>

## Shipped
- <deliverable> — <one line on what it is> [Source: company/<dept>/…]

## Blocked
- ★ <blocker> — needs <exact account/key/approval> · blocked <n> agents · owner: human [Source: …]

## Learned
- <gotcha / decision / number> [Source: …]

## Next
- [ ] <next action> (carried over | new) [Source: …]
```

If the caller runs inside a repo (C&C does), also write the same markdown to
`company/<dept>/retros/<YYYY-MM-DD>.md` so it is visible in git.

## Phase 4: Remember 3 facts

For each candidate learned item, `recall` it first; skip it if the brain already knows it.
Then `remember` exactly three, each one sentence, prefixed with the department:

- `"[<dept>] <durable fact>"` e.g. `"[marketing] Posting the X launch thread needs the @cc_hq account (phone-verified)."`

Return to the caller: the retro slug, the three remembered facts, and counts
(`shipped`, `blocked`, `learned`, `next`).

## Anti-patterns

- Summarizing agent chatter instead of deliverables. If there is no page, it didn't ship.
- Remembering the retro itself as a fact (it's a page; facts are the durable residue).
- Mixing departments in one retro. Run the skill once per department.
- Writing more than 3 facts "because they were all good". Pick the three that change next cycle's work.
