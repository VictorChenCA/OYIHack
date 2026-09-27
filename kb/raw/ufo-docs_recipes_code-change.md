Source: https://ufo.ai/docs/recipes/code-change/

Make a code change

Connect firstSection titled “Connect first”

Connect the GitHub account that can read and write the repository. Connect
logs, issues, or design files when the task needs them.

State the repository when several are available.

Example requestSection titled “Example request”

In acme/web, fix the error that prevents a member from saving a dashboard with no description.
Reproduce the error before you change code. Add the test that would have caught it, run the
focused checks, and verify the form in a browser. Open a draft pull request. Do not deploy or
merge it.

What your UFO doesSection titled “What your UFO does”

Your UFO reads the repository instructions and code. It reproduces the problem, makes a
focused fix, and runs focused checks. It can use a browser to check a visible result.

The final reply includes the change, test results, pull request, and anything UFO could not check.

Useful limitsSection titled “Useful limits”

State these when they matter:

The repository, branch, or issue in scope.

Whether your UFO may commit, push, or open a pull request.

Whether the pull request must be a draft.

Whether it may change a public API, database schema, or dependency.

Whether it may deploy or merge.

Follow up in the same conversationSection titled “Follow up in the same conversation”

Address the review comments that apply to this change. Explain any comment you do not accept.

Wait for CI. Fix only failures caused by this branch, then report the latest commit and check results.

Update the pull request description with the test results and browser checks. Do not merge.
