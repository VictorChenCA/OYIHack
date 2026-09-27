# C&C company to-dos

Live to-dos for the company. C&C reads this file and shows every open item as a blocker in the owning team.
Format: `- [ ] <title> · team:<engineering|product|design|marketing|operations> · owner:<name> · due:<HH:MM> · type:<do_now|schedule|delegate|drop> · person` (`person` = needs a human).
Check an item (`- [x]`) or press "Mark done" in C&C to clear it.

## Operations
- [ ] Record the 1–2 minute demo video · team:operations · owner:Victor Chen · due:16:40 · type:do_now · person
- [ ] Submit the hackathon form (GitHub URL + video) · team:operations · owner:Victor Chen · due:16:55 · type:do_now · person
- [ ] Rotate the River API key after the event · team:operations · owner:Victor Chen · due:23:00 · type:schedule · person
- [ ] Revoke the local GBrain token (oyihack-agents) after the event · team:operations · owner:Victor Chen · due:23:00 · type:schedule · person
- [ ] Scale the River deployment to zero or delete it · team:operations · owner:Victor Chen · due:18:00 · type:schedule · person
- [ ] Reconcile today's credit spend (Claude, River, GBrain) · team:operations · owner:Victor Chen · due:18:30 · type:delegate
- [ ] Scan git history for leaked keys before the repo goes public · team:operations · owner:Victor Chen · due:16:30 · type:do_now
- [ ] Make the GitHub repo public and check it in an incognito window · team:operations · owner:Victor Chen · due:16:40 · type:do_now · person
- [ ] Put the demo video link in the README before submitting · team:operations · owner:Victor Chen · due:16:50 · type:delegate
- [ ] Confirm the 18:00 Daily Sync ran and wrote its summary to GBrain · team:operations · owner:Victor Chen · due:18:15 · type:delegate
- [ ] Stop idle Superset agents and the sim so they don't spend overnight · team:operations · owner:Victor Chen · due:19:00 · type:schedule
- [ ] Decide whether to pay for GBrain before the 2-week trial ends · team:operations · owner:Victor Chen · due:21:00 · type:schedule · person

## Product
- [ ] Decide the post-hackathon roadmap: multi-company galaxy, team invites · team:product · owner:Victor Chen · due:20:00 · type:schedule · person
- [ ] Write the spec for real multiplayer ownership (invites, roles) · team:product · owner:Victor Chen · due:21:00 · type:delegate
- [ ] Summarize judge and sponsor feedback from the demo · team:product · owner:Victor Chen · due:19:00 · type:delegate
- [ ] Lock the demo click-path and fallback if live agents stall · team:product · owner:Victor Chen · due:16:35 · type:do_now · person
- [ ] Capture judge and sponsor questions verbatim during judging · team:product · owner:Victor Chen · due:17:15 · type:do_now · person
- [ ] Draft answers to likely judge Qs: why RTS, what's real vs simulated · team:product · owner:Victor Chen · due:16:50 · type:delegate
- [ ] Ask GBrain and Superset leads for multi-company API needs on site · team:product · owner:Victor Chen · due:17:45 · type:schedule · person
- [ ] Spec the multi-company galaxy: one GBrain per company, switcher · team:product · owner:Victor Chen · due:22:30 · type:schedule
- [ ] Add pricing tiers to the README · team:product · owner:Victor Chen · due:23:30 · type:drop

## Engineering
- [ ] Give Superset agents GBRAIN_TOKEN so they can reach company memory · team:engineering · owner:Victor Chen · due:16:30 · type:do_now · person
- [ ] Publish the after-action report as a Superset Page · team:engineering · owner:Victor Chen · due:16:45 · type:do_now · person
- [ ] Scan full git history for leaked keys (gitleaks) before judging · team:engineering · owner:Victor Chen · due:16:35 · type:do_now
- [ ] Smoke-test the ngrok link: map streams, /hook and commands return 403 · team:engineering · owner:Victor Chen · due:16:45 · type:do_now
- [ ] Tag demo build on main and hold further merges until judging ends · team:engineering · owner:Victor Chen · due:16:55 · type:do_now
- [ ] Untrack app/river/__pycache__ and gitignore *.pyc before final push · team:engineering · owner:Victor Chen · due:16:50 · type:delegate
- [ ] Shut down the ngrok tunnel and local River sidecar after judging · team:engineering · owner:Victor Chen · due:17:30 · type:schedule
- [ ] Chase River LoRA latency under 1.5 s (in-memory bench showed no gain) · team:engineering · owner:Victor Chen · due:23:00 · type:drop

## Design
- [ ] Record a GIF of Galaxy view for the README · team:design · owner:Victor Chen · due:17:30 · type:drop
- [ ] Sign off on the legend, vignette and no-fog map before recording · team:design · owner:Victor Chen · due:16:35 · type:do_now · person
- [ ] Capture a 1600x900 Galaxy view screenshot for the README and form · team:design · owner:Victor Chen · due:16:50 · type:delegate
- [ ] Pick the C&C logo mark for the X avatar and favicon · team:design · owner:Victor Chen · due:17:45 · type:schedule · person
- [ ] Export favicon, X avatar and 1200x630 OG card from the chosen logo · team:design · owner:Victor Chen · due:18:15 · type:delegate
- [ ] Build the landing page (site/index.html) around the demo video · team:design · owner:Victor Chen · due:21:00 · type:schedule
- [ ] Redraw the Kenney placeholder ships as custom C&C hull art · team:design · owner:Victor Chen · due:23:30 · type:drop

## Marketing
- [ ] Create the C&C account on X (phone verification) · team:marketing · owner:Victor Chen · due:18:00 · type:schedule · person
- [ ] Post the launch thread once the X account exists · team:marketing · owner:Victor Chen · due:18:30 · type:delegate
- [ ] Upload the demo video (unlisted) and link it in the README · team:marketing · owner:Victor Chen · due:16:50 · type:do_now · person
- [ ] Get a photo and 15s clip of the live demo on stage · team:marketing · owner:Victor Chen · due:17:10 · type:do_now · person
- [ ] Cut a 30s vertical demo clip for TikTok and Reels · team:marketing · owner:Victor Chen · due:18:00 · type:delegate
- [ ] Post the LinkedIn launch post with the demo video · team:marketing · owner:Victor Chen · due:20:00 · type:schedule · person
- [ ] DM 10 founders running agent swarms to book feedback calls · team:marketing · owner:Victor Chen · due:21:30 · type:schedule · person
- [ ] Post Show HN tonight (hold for Tuesday 8am PT instead) · team:marketing · owner:Victor Chen · due:22:00 · type:drop · person
