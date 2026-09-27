# Final submission draft (form opens 16:00, due 17:00)

Form: https://docs.google.com/forms/d/e/1FAIpQLSdiU5L7PhlkD7HQQouQKPSlm7WrobkdJuvSZLoi6O7jXRWKiQ/viewform
Anything marked **[VERIFY]** must be true in the demo before you submit. Delete it if it didn't ship.

## 1. Email
victor36@stanford.edu

## 2. Team Name
C&C

## 3. Member Names + Emails
Victor Chen, victor36@stanford.edu

## 4. Project Description
C&C (Command & Control) is a real-time-strategy command center for running a company made of AI agents from one
screen. QM's team said at kickoff that nobody has figured out how to visualize swarms; C&C is our answer. The company is a solar
system. The sun is GBrain, the company's memory: it pulses on every live read and write, and it sends energy beams to each
department. Departments are planets that visibly colonize as agents work there. Every Claude Code agent is a real unit,
driven by live HTTP hooks. Main sessions are motherships whose subagents fly out and dock back. A unit's distance travelled is
elapsed time over its ETA, and its health is its remaining budget. Blockers are enemies tethered to every unit they hold.
They're sized by how many units they block and shaped by an urgent/important grid, and human-only blockers (keys, signups,
approvals) are gold, so one missing token holding five agents is one target you resolve once. Agents launch into
Superset worktrees from the map.
[VERIFY] Memorable procedures turn repeat tasks into charted lanes with a known ETA, while first-time tasks fly into the fog.
A River-trained model, the Sentinel (Qwen3.5-9B + LoRA, 100 SFT steps on C&C's triage policy), classifies every blocker the moment it appears: kind, urgency, human-only or not, team, and best agent tier, with calibrated confidences. On 260 unseen blockers (held-out vendors, tasks and phrasings), mean accuracy rose from 0.545 (base) to 0.916 (trained), and all five fields were right in 67% of cases, up from 5%. The Research Center in C&C lets you correct classifications and retrain on River.
We used C&C to run its own launch: the agents on screen built and marketed C&C today.
The scale shot uses a simulator and is labeled SIMULATED.

## 5. Github URL
(fill in: public repo)

## 6. Demo Video URL
(fill in: 1–2 minutes, anyone with the link can view)

## 7. Side Quests (tick only the ones that are real in the demo)
- [ ] **Superset**, "Best Agent Swarm". Tick it if Command was built by parallel Superset workspaces **and** the
      after-action report is published as a Superset Page (`superset pages publish … --visibility everyone`). Strong fit.
- [ ] **GBrain**, "new skill or memory improvement". GBrain use is mandatory anyway. Tick it if we ship a new GBrain skill
      (for example the Daily Sync factory skill, or an after-action-report skill that writes a swarm's results to the brain).
- [ ] **Memorable**. Tick it if a Memorable recall really sets a repeat task's ETA (known road versus fog) in the demo.
- [x] **River AI**. The Sentinel is live in the demo (the River sidecar), with base vs trained in `app/river/eval.md` and on the Research Center card.
- [ ] **QM**. Needs a fork of `yc-software/qm`. Tick it only if Command is wired into a QM fork (for example QM swarm
      sessions feeding the map). Command answers QM's swarm-visualization problem, so it's worth it if there's time.
- [ ] **UFO**. Not used; leave unticked.

## 8. Anything else you'd like the judges / organizers to know?
Built solo during hacking hours; the git history shows it. What's real: live Claude Code hook telemetry (sessions,
subagents, tool calls, permission prompts, failures), GBrain as the shared memory, and agent spawning through the Superset CLI.
What's simulated: the 300-unit scale shot, which uses the built-in simulator and is labeled on screen.
[VERIFY] After-action report as a Superset Page: <page URL>.
Run it: `cd app && bun install && bun run start`, then open http://localhost:7777 (`bun run sim` for synthetic load).

## Before you hit submit
- [ ] `app/` is committed (it's all still uncommitted as of 14:35) and pushed to a **public** GitHub repo. Check it in an incognito window.
- [ ] No keys in history: `git log -p | grep -E "rv_|mk_|sk_live_|gbrain_[0-9a-f]"` returns nothing (`.env` is gitignored).
- [ ] The video is 1–2 minutes and set to anyone with the link. Check it in incognito.
- [ ] Every [VERIFY] line above is either true or deleted. Side-quest ticks match what's real.
