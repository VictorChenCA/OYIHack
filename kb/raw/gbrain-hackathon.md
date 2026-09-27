# GBrain: free hackathon workspace
Source: https://gbrain.io/gratis/own-your-intelligence (mirrored Sep 27 2026), plus https://gbrain.io/works-with/claude-code and
https://gbrain.io/tools/features/mcp

## A free GBrain for two weeks
For everyone at YC's Own Your Intelligence Hackathon: a workspace running in seconds, with $50 of AI
credit to start using right away. Sign in at https://gbrain.io/gratis/own-your-intelligence/sign-in ("Get a free GBrain").
No card, and nothing to pay for two weeks. After that, keeping it is $199 a month.

The whole workspace, on us, for two weeks:
- Models from Anthropic and OpenAI, switched any time
- Scheduled work that runs while you sleep
- $50 of credit for AI and metered tools, to start
- Multiplayer: the whole team in one workspace
- Email, calendar and the web, connected once
- Onboarding and support direct from us
- Bring your own Anthropic or OpenAI key whenever you like

Four parts: **Memory** (what the workspace knows, in files the team owns), **Tools** (the accounts
the workspace reaches and what each AI may do with them), **Skills** (jobs it runs on demand or on a
schedule), **Workspace** (the room a team works in, and the server underneath).

## What you are signing up for
- **After two weeks it pauses.** Keeping it costs $199/month for the whole team. A workspace nobody
  keeps is deleted 5 days later, with an email first.
- **It starts with $50 of AI credit** for the models and for metered tools (web search, page
  crawling). Adding your own Anthropic/OpenAI key switches the models to that key.
- **The whole team comes along.** Invitees share the same conversation and memory at no extra cost.
- **One free GBrain per person.** If you already have one, the link sends you back to it.
- **Leaving takes the notes with you.** Everything learned is plain markdown in a folder you can copy.
- **The offer ends October 5.** After that the link stops starting new workspaces.

## Connecting agents (from /works-with/claude-code)
"One endpoint connects Claude Code. Not one per service." The token comes from the client's own page
in the workspace, minted once and shown once:
```bash
claude mcp add gbrain https://gbrain.io/mcp --header "Authorization: Bearer <token>"
```
What a client can call is decided by its permission, not by the address. Connected apps: Gmail,
Google Calendar, Google Drive, web search (Exa), page fetching; company research is "not yet".
Agents inside a workspace are already signed in, so there's nothing to hook up.

## Tools plane (from /tools/features/mcp)
- **One CLI for every connected account:** `gbrainio tool gmail search --unread --newer-than 2d`,
  `gbrainio tool gcal list-events --limit 3`, `gbrainio tool gmail draft --reply-to <id> --body "..."`.
- **Key custody:** GBrain holds the account keys and never hands one to an AI. The AI gets only results.
- **Permission levels per app:** Gmail has Off/Read/Draft/Manage/Full; Calendar has Off/Read/Full;
  web search is on or off. Every AI follows them.
- **Circuit breakers:** daily call limits per tool (for example, 200 "move a message" calls a day,
  then it stops for the day).
- Activity log, expiring access (a kill switch), and the record is written either way.
