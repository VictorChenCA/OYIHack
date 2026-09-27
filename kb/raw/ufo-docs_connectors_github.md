Source: https://ufo.ai/docs/connectors/github/

Connecting GitHub

Connect GitHubSection titled “Connect GitHub”

OAuth
Personal

Ask in chat
Send this message to the agent.
Copy
```
Connect my GitHub account.
```

or

Use Connectors
Find GitHub on the Connectors page.Open Connectors →

Open the connection link in UFO’s reply. Approve access to the organizations and repositories that
you need. Each member connects their own account. UFO can access only the GitHub organizations and
repositories available to that account.

What UFO can doSection titled “What UFO can do”

With the required repository access, UFO can:

Read and change repository files.

Clone private repositories and push branches.

Open and update pull requests.

Read issues, reviews, checks, and GitHub Actions runs.

Publish requested issue, pull request, or review changes.

Name the repository and branch. State which checks to run and whether UFO can publish changes.

Fix the failing type check in acme/web. Run the focused tests and open a pull request. Do not
merge it.

Add a repository as knowledgeSection titled “Add a repository as knowledge”

Use a synced source to make Markdown files available as shared knowledge or to
start work when selected repository streams change.

Fix GitHub accessSection titled “Fix GitHub access”

If UFO can read issues but cannot clone or push a private repository, reconnect the account of the
member who requested the work. Confirm that this account can access the repository. A teammate’s
connection does not grant your session access.

See Writing code and Reviewing pull requests.
