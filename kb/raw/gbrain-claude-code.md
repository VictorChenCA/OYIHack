Source: https://gbrain.io/works-with/claude-code



 Works with Claude Code
 · an agent that remembers for you

 Skip to main content

 GBrain

 Claude Code

 Claude Code, with the team's accounts in the room

 Mail, calendar and web search mid-task, no key in mcp.json.

 gbrain.io

 GBrain

 Get Started

 Menu

 Get Started

 Claude Code

 Claude Code, with the team's accounts in the room.

 Mail, calendar and web search mid-task, no key in mcp.json.

Claude Code is good at the code in front of it. It cannot read the email thread where a bug was reported or check when the fix is due, so you end up pasting that context in yourself.
GBrain connects on two sides. Over MCP it gives Claude Code tools: mail search, calendar, web search, page fetching. And GBrain workspaces run Anthropic models, so the company behind the assistant also makes the model the workspaces run on.
You choose which tools it gets, and the token in mcp.json can be revoked at any time. No API keys on disk.

 One endpoint connects Claude Code

 Not one per service. What this client can call is decided by its
 permission, not by the address, and the token comes from the
 client's own page in the workspace, minted once and shown once.

```
$ claude mcp add gbrain https://gbrain.io/mcp --header "Authorization: Bearer <token>"

```

 Every application Claude Code gets

 Connect one in the browser and it answers here, under the same
 permission and the same record as everywhere else.

 Gmail

 Search, read, file and draft mail from a terminal or an assistant.

 Google Calendar

 List, add, change and cancel events without leaving the terminal.

 Google Drive

 Find a document, read it, change it, and get it back as a PDF.

 Web search

 Search the live web and get back text, not a page of links.

 Page fetching

 Turn a URL into readable text, including pages that need a browser.

 Company research

 Not yet

 Company bios and investor searches, from the terminal or any assistant.

 The other places a connection answers are on Works with, and

 Tools

 explains the permission, the ceiling and the record they share.

