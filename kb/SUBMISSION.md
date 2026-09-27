# Final submission draft (form opens 16:00, due 17:00)

Form: https://docs.google.com/forms/d/e/1FAIpQLSdiU5L7PhlkD7HQQouQKPSlm7WrobkdJuvSZLoi6O7jXRWKiQ/viewform
Anything marked **[VERIFY]** must be true in the demo before you submit. Delete it if it didn't ship.

## 1. Email
victor36@stanford.edu

## 2. Team Name
Command

## 3. Member Names + Emails
Victor Chen, victor36@stanford.edu

## 4. Project Description
Command is an RTS-style command center for running a swarm of coding agents from one screen. QM's team said at
kickoff that nobody has figured out how to visualize swarms faithfully or efficiently; Command is our answer.
Every Claude Code agent reports through HTTP hooks, and its state drives the map. Each main session is a
mothership whose subagents launch from it and return when done. A unit's distance travelled is elapsed time over
its ETA, and its health is its remaining time budget, which failed tool calls reduce. Blockers (permission prompts,
missing keys, rate limits) appear as enemies tethered to every unit they block. They grow with the number of units
held, and are ranked on an urgent/important grid, so one missing token holding six agents is one big target you
resolve once. You spawn agents from per-project barracks through Superset worktrees, and send prompts from a
command bar. GBrain is the HQ at the center of the map: finished work is written to it as memory.
[VERIFY] Memorable procedures give repeat tasks a known ETA. First-time tasks head into the fog.
[VERIFY] River: a model we trained is the Forge.
A simulator scales the same view to 300 units, and it's labeled SIMULATED on screen.

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
- [ ] **River AI**. Tick it only if a model trained with the River API is used in the demo, with base vs trained shown.
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
