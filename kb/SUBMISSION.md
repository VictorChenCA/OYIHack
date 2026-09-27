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
C&C (Command and Control) shows a founder what their company of AI agents is doing, what's blocking it, and where to send agents
next, on one screen. It's a tool for founders, engineers and startup teams, not a game: it borrows swarm management from real-time
strategy games and builds on the sponsors. QM's team said at kickoff that nobody has figured out how to visualize swarms; this is our
attempt.

**How it works:** every Claude Code agent reports live through HTTP hooks.
- **The company is a system around a sun, GBrain (company memory).** Distance from the sun is distance from what the company knows:
  teams drift inward as their knowledge grows, known work flies sunward on routes with an ETA, and first-time work flies into the
  fog. The sun pulses once per memory write with a caption of what was added.
- **Agents launch into Superset worktrees from the map, and you prompt them from C&C.**
- **Blockers come in four types (do now, schedule, delegate, drop).** Gold means it needs a person, size means how many agents it
  holds, and each sits at the frontier of the team it concerns. One missing token holding five agents is one blocker you resolve once.
- **A River-trained "System One" classifier (the Sentinel, Qwen3.5-9B + LoRA)** labels every blocker in about 4s. On 260 unseen blockers,
  mean accuracy went from 0.545 (base) to 0.916 (trained). A Research Center lets you correct it and retrain.
- **Headless Claude** writes each agent's summary, ranks agents by fit for a blocker, and powers a command bar that builds views.

We used C&C to run its own launch: the agents on screen built and marketed C&C today. The scale shot uses a simulator and is labeled SIMULATED.

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
**Live, read-only:** https://6310-64-71-26-103.ngrok-free.app (hosted from the builder's laptop through ngrok until judging ends). Remote viewers can look at everything but can't
launch or prompt agents.

**Everything in Galaxy view is real (only the home page's company switcher is mocked):**
- **Agents:** every Claude Code session that worked on this company today, including the swarm that built C&C and the
  River-training mothership with its per-step subagents. It's rebuilt from the real transcripts, and live sessions stream in through HTTP hooks.
- **Blockers:** agents' real blockers, triaged by the River-trained Sentinel.
- **To-dos:** the company's real to-dos from `company/todos.md`, which also show as blockers in the owning team. "Mark done" checks the box in the file.
- **Recurring jobs** (the moons): real schedules that launch Superset agents.
- **Memory:** GBrain, the hosted company brain.
- **Simulated:** only the optional scale shot (`server/sim.ts`), and it's labeled SIMULATED on screen.

Built solo during hacking hours; the git history shows it. Run it: `cd app && bun install && bun run start`, then open http://localhost:7777.

## Before you hit submit
- [ ] `app/` is committed (it's all still uncommitted as of 14:35) and pushed to a **public** GitHub repo. Check it in an incognito window.
- [ ] No keys in history: `git log -p | grep -E "rv_|mk_|sk_live_|gbrain_[0-9a-f]"` returns nothing (`.env` is gitignored).
- [ ] The video is 1–2 minutes and set to anyone with the link. Check it in incognito.
- [ ] Every [VERIFY] line above is either true or deleted. Side-quest ticks match what's real.
