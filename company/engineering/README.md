# Engineering planet

**Project:** GBrain PR triage (`gbrain-triage`). This planet is also home to the swarm that builds C&C itself (`cc-app`).

What the agents produce here:
- `pr-triage.md`: one row for each of GBrain's 10 oldest open PRs (`gh pr list -R garrytan/gbrain --state open`):
  verdict (merge / needs work / close), risk (low / med / high), next step.
- GBrain pages under `company/engineering/pr-triage/<pr-number>`: one summary per PR.

The work is read-only on GitHub. Commenting on a PR needs a GitHub token, which is the expected **gold** (human-only) blocker.
