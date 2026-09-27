# Own Your Intelligence Hackathon (YC), Sun Sep 27 2026

**Where:** YC, 560 20th St, San Francisco. Have the check-in QR code ready. Bring a charger (YC has no spares).

| Time | What |
|---|---|
| 12:00 | Doors, registration, lunch |
| 13:00 | Opening remarks |
| **13:30** | **Hacking starts** (confirmed on the kickoff slide) |
| 16:00 | Submissions page goes up |
| **17:00** | **Hacking ends, projects due** (hard stop, about 3h30m of build time) |
| 17:00–17:45 | Judging |
| 18:00 | Prizes and closing |

**Hosts/sponsors:** River AI, GBrain, Memorable, QM, Superset, UFO.

**Brief (verbatim intent):** "building at the frontier of AI-native software… explore new ways to
**extend QM and GBrain**, build novel **agent workflows and interfaces**, experiment with
**multiplayer** and **software-factory** ideas, and use River AI, Memorable, Superset and UFO to push
beyond what today's tools make easy. The goal is to make something **ambitious, useful, or unexpected**."

## Prizes
**Grand prize: $5k, a 1:1 with Garry Tan, and a YC interview.**

Side quests are separate sponsor prizes, and the form uses **checkboxes, so you can enter several**.
Quoted from the kickoff slide:

| Sponsor | Side quest | What it takes to qualify |
|---|---|---|
| GBrain | "Solve tedious human problems with a new skill or memory improvement" | A new GBrain skill, or a memory improvement, aimed at a real chore |
| QM | "Fork QM and make it do something new! Push the harness in any direction." | An actual **fork** of `yc-software/qm` with new behavior |
| River AI | "Best use of a custom model/agent (trained using River API)" | A model you **trained with the River API** (SFT/RL/distill) that the demo uses. The River page adds: show the training data or reward signal, and compare against base on unseen tasks |
| Memorable | "Most Memorable. The most interesting/innovative use case of Memorable." | A novel use of Memorable procedures |
| UFO | "Best extension, Best business automation for startups." | A UFO extension, or a startup business automation built on UFO |
| Superset | "Best Agent Swarm. The most impressive project built by running many coding agents in parallel with Superset. **Presented with Superset Pages.**" | Built with parallel Superset agents, **and the presentation is a Superset Page** |

## Submissions
**Form:** https://docs.google.com/forms/d/e/1FAIpQLSdiU5L7PhlkD7HQQouQKPSlm7WrobkdJuvSZLoi6O7jXRWKiQ/viewform
The page opens at 16:00. Submissions are due at **17:00**.

Form fields, in order (* = required):
1. Email *
2. Team Name *
3. Member Names + Emails (comma separated) *
4. Project Description * (paragraph)
5. Github URL *
6. Demo Video URL (loom, vimeo, etc) *
7. Side Quest (if any): checkboxes for River AI, GBrain, Memorable, QM, Superset, UFO
8. Anything else you'd like the judges / organizers to know? (paragraph)

**IMPORTANT (from the slide): every link must be publicly accessible before you submit.** Make the
GitHub repo **public** and set the video to anyone-with-link, then open both in an incognito window to check.
Draft the description and the "anything else" answer ahead of time (sponsor usage, what's new, what's real
versus mocked).

## Read the theme
The theme is "Own Your Intelligence": you own your memory, your weights, and your agent runtime.
- GBrain gives you memory you own (markdown and Postgres, MCP).
- Memorable gives you procedural memory in your own database.
- River gives you weights you own (fine-tune or RL open models, then download the adapter).
- QM and UFO are self-hostable agent runtimes.
- Superset runs parallel coding agents locally.

QM and GBrain are named first in the brief, so extending them is the scoring center of gravity.
Both are Garry Tan / YC projects (`yc-software/qm`, `garrytan/gbrain`).

## Unknowns to resolve at the 13:00 kickoff (write the answers here)
- [x] Prize tracks per sponsor: see **Prizes** above
- [ ] Judging criteria? Team size limit?
- [x] Submission format and location: form on the submissions page (opens 16:00); see **Submissions** above
- [x] **River credits:** free at the River AI booth; unused credits expire at the end of the day (`kb/sponsors/river.md`)
- [ ] **UFO credits?** Hosted UFO runs on a prepaid balance and needs a card.
- [ ] **Hosted QM instance for hackers?** Self-deploying QM needs Fly/AWS or local Docker plus Postgres.
- [ ] Memorable dashboard key (`mk_...`) for agents, from memorable.sh/dash
- [ ] Superset API key (`sk_live_...`) and org ID if you use the SDK
