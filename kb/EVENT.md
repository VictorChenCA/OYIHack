# Own Your Intelligence Hackathon (YC), Sun Sep 27 2026

**Where:** YC, 560 20th St, San Francisco. Have the check-in QR code ready. Bring a charger (YC has no spares).

| Time | What |
|---|---|
| 12:00 | Doors, registration, lunch |
| 13:00 | Opening remarks |
| **13:30** | **Hacking starts** (kickoff slide. The YC event page still says 13:15, which is stale, so trust the slide) |
| 16:00 | Submissions page goes up |
| **17:00** | **Hacking ends, projects due** (hard stop, about 3h30m of build time) |
| 17:00–17:45 | Judging |
| 18:00 | Prizes and closing |

**Hosts/sponsors:** River AI, GBrain, Memorable, QM, Superset, UFO.
Event page: https://events.ycombinator.com/gbrain-qm-river-memorable-hackathon (capacity 225, team applications allowed,
16+). Sponsor hackathon pages exist only for **River** (`kb/raw/river/hackathon/page.md`) and **GBrain**
(`kb/raw/gbrain-hackathon.md`), plus the agent37 QM credit. Memorable, Superset and UFO have none (checked
Sep 27 ~13:30, all 404), so don't search for them. Memorable's hackathon material is the kit in `kb/repos/memorable-hackathon-kit`.

**Brief (verbatim intent):** "building at the frontier of AI-native software… explore new ways to
**extend QM and GBrain**, build novel **agent workflows and interfaces**, experiment with
**multiplayer** and **software-factory** ideas, and use River AI, Memorable, Superset and UFO to push
beyond what today's tools make easy. The goal is to make something **ambitious, useful, or unexpected**."

## Prizes
## Rules and goal (kickoff slide, verbatim)
**Goal:** "Extend QM and GBrain. Push further with River AI, Memorable, Superset and UFO. Ship something that
didn't exist this morning. **This isn't a pitch competition.**"

**Rules:**
- **Build something using GBrain.** GBrain is mandatory for every project, not just its side quest.
- **No prebuilt projects / forks of existing projects.**
- **Must build during hackathon hours** (13:30–17:00).

What this means for us:
- Every idea must put GBrain on the demo's critical path (a recall/remember call the demo visibly depends on).
- Judges want working software, not slides. Demo the real thing live and keep the video as the backup.
- `kb/` is prep and research, which is fine. **All product code must be written after 13:30** in `app/` (or a
  new dir). Commit often so the git timestamps prove it. Don't paste in code from earlier personal projects.
- There's tension between the "no forks" rule and the QM side quest ("Fork QM and make it do something new").
  Our reading: the rule bans forking *your own or others' finished projects*, while forking the sponsor's QM
  repo to extend it is explicitly invited. **Confirm with an organizer before building on a QM fork.**

## Prizes (kickoff slide)
**Grand prize: a YC interview and a 1:1 working session with Garry.**
Cash: **1st $5,000 · 2nd $2,000 · 3rd $1,000.**

Sponsor side quest prizes:
| Sponsor | Prize |
|---|---|
| QM | Mac mini |
| River | 50k / 25k / 15k River API credits (1st/2nd/3rd) |
| Memorable | Memorable Pro, bomber jackets; spoken: **1st AirPods Pro + $500, 2nd $250, 3rd $100** |
| UFO | Unlimited lifetime UFO access |
| Superset | AirPods Max plus a year of Superset Pro |

Side quests are separate sponsor prizes, and the form uses **checkboxes, so you can enter several**.
Criteria, quoted from the kickoff slide:

| Sponsor | Side quest | What it takes to qualify |
|---|---|---|
| GBrain | "Solve tedious human problems with a new skill or memory improvement" | A new GBrain skill, or a memory improvement, aimed at a real chore |
| QM | "Fork QM and make it do something new! Push the harness in any direction." | An actual **fork** of `yc-software/qm` with new behavior. Slide examples: play a video game, what you wish Codex/Claude Cowork could do, swarms, RTS-style UX, multiplayer, computer use (`kb/sponsors/qm.md`) |
| River AI | "Best use of a custom model/agent (trained using River API)" | A model you **trained with the River API** (SFT/RL/distill) that the demo uses. The River page adds: show the training data or reward signal, and compare against base on unseen tasks |
| Memorable | "Most Memorable. The most interesting/innovative use case of Memorable." | A novel use of Memorable procedures |
| UFO | "Best extension, Best business automation for startups." | A UFO extension, or a startup business automation built on UFO |
| Superset | "Best Agent Swarm. The most impressive project built by running many coding agents in parallel with Superset. **Presented with Superset Pages.**" | Built with parallel Superset agents, **and the presentation is a Superset Page** |

## Free credits and offers
- **River:** free API credits at the River AI booth. Unused credits expire at the end of the day.
- **GBrain:** a free hosted workspace for 2 weeks with $50 of AI credit, one per person, no card:
  https://gbrain.io/gratis/own-your-intelligence. Details in `kb/sponsors/gbrain.md`.
- **QM:** agent37 hosting credit, code `QMHACK`: https://www.agent37.com/redeem/QMHACK. Hosted QM is at https://www.agent37.com/qm,
  and agent37 also works as QM's sandbox backend (`SANDBOX_BACKEND=agent37`).

## Kickoff talk: what the speakers added (Granola, full text in `kb/raw/kickoff/`)
- **Judging is about what you built today.** The organizer warned against taking "a really established project,
  fork it and slap your name on it." Judges look at what was built in the timeframe.
- **Demo video: 1–2 minutes.** Side-quest checkboxes route your project to the right sponsor judges.
- **Cash is split among team members** (solo keeps it all). The grand prize is also 1st place: the 1:1 with Garry plus $5,000.
- **Sponsors and founders are the judges, and they're on the floor all day.** Show them work in progress and ask for feedback.
- Build spaces: main room, the room next door, and a field space downstairs (left out of the main room, then left down the stairs).
- The organizers will post a YC message that "codifies everything".
- Speakers:
  - River: Igor, CEO and xAI co-founder.
  - GBrain: Sina (open source) and Brad (gbrain.io).
  - QM: Josh (leads YC Labs) and Eve.
  - Memorable: Miguel.
  - UFO: Marshall and Alex (co-founders; Alex created GitHub Copilot and built Perplexity Computer).
- Garry, to the room: "probably the best hackathon applicants that YC has ever received."
- **Alex's advice for agents that finish real tasks:** "look at the data." Diagnose each failure as model vs.
  context vs. software, then "calibrate judges" (LLM graders) on the failure modes you actually saw, and scale from there.

### What each sponsor said they're looking for
| Sponsor | In their words |
|---|---|
| River | "the best use of the API to create a custom model for agents"; "creative new ideas"; own "the means of intelligence" |
| GBrain | "solve a tedious task using GBrain", with skills, "for people outside of this room who aren't as AI cool as we are" |
| QM | "fork it and push the boundaries"; what you'd love Codex/Claude to have; **"nobody has figured out how to faithfully or efficiently visualize swarms"**; agents playing video games (Minecraft last week); computer use. They welcome UI feedback |
| Memorable | "think really big... change how agent computation is done on a specific environment"; "change the way agents are thinking using Memorable on a specific domain" |
| Superset | "Build whatever you're building on Superset and demonstrate it using a Superset Page"; any agent works |
| UFO | extensions, especially **links between the sponsors** ("GBrain, QM, even River or Memorable would be great to hack into UFO"), or the best business automation |

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
- [ ] Judging criteria? Team size limit? (Kickoff talk: judges weigh what you built today, and sponsors judge their side quests.) (Nothing published. The event page only says teams are allowed. Ask an organizer.)
- [x] Submission format and location: form on the submissions page (opens 16:00); see **Submissions** above
- [x] **River credits:** free at the River AI booth; unused credits expire at the end of the day (`kb/sponsors/river.md`)
- [ ] **UFO credits?** Hosted UFO runs on a prepaid balance and needs a card.
- [x] **Hosted QM for hackers:** agent37 credit at https://www.agent37.com/redeem/QMHACK (see `kb/sponsors/qm.md`)
- [ ] Memorable dashboard key (`mk_...`) for agents, from memorable.sh/dash
- [ ] Superset API key (`sk_live_...`) and org ID if you use the SDK
