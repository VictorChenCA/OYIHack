"""Teacher dataset for the Sentinel.

The teacher (Claude, writing this file) authored realistic blocker scenarios in the style of Claude Code hook payloads and
labels each one by `policy.md`. Held-out ("unseen") items use vendors, task contexts, message phrasings and a payload
format that never appear in train/val.

    python gen_data.py            # writes data/{train,val,test_unseen}.jsonl
"""
import json, random
from pathlib import Path

rng = random.Random(7)
OUT = Path(__file__).parent / "data"

# ---------------------------------------------------------------- task contexts: (department, tier, text, held_out)
TASKS = {
    "engineering": {
        "haiku": ["bump lodash to the latest patch in package.json", "fix a typo in the README install section",
                  "look up the current Node LTS version for the Dockerfile", "add .env.local to .gitignore",
                  "rename the DB_URL env var in docker-compose.yml"],
        "sonnet": ["implement the /api/checkout endpoint", "add pagination to the orders table API",
                   "write integration tests for the Stripe webhook handler", "add GitHub OAuth login to the app",
                   "build the CSV export for the admin dashboard", "wire the signup form to the users table"],
        "opus": ["migrate the auth layer of the monorepo to a shared service across 12 packages",
                 "refactor the event pipeline onto a durable queue across the backend",
                 "redesign the database schema for multi-tenancy", "port the whole API from Express to Hono with zero downtime"],
        "fable": ["design and prove correct the distributed job scheduler for the agent swarm",
                  "plan and execute the 6-month re-architecture to an event-sourced core",
                  "autonomously run the week-long migration of every service to the new platform"],
    },
    "marketing": {
        "haiku": ["schedule the pre-written launch tweet for 9am", "look up our current follower counts",
                  "fix the typo in the newsletter subject line", "add UTM tags to the launch links"],
        "sonnet": ["write the launch thread for X", "draft 5 cold outreach emails to design partners",
                   "write the Product Hunt tagline and description", "write the launch-day newsletter",
                   "draft the LinkedIn announcement post"],
        "opus": ["plan the multi-channel launch campaign across X, LinkedIn and email",
                 "build go-to-market positioning for the enterprise tier",
                 "run the 50-account outbound sequence with personalised research"],
        "fable": ["own the 3-month growth strategy and run experiments autonomously",
                  "define the company narrative and category strategy for the Series A"],
    },
    "product_design": {
        "haiku": ["change the CTA button color on the landing page", "export the onboarding flow screenshots",
                  "update the footer links on the landing page"],
        "sonnet": ["build the pricing page layout", "design the signup flow", "implement the landing page hero section",
                   "design the empty states for the dashboard", "prototype the settings page UX"],
        "opus": ["redesign the entire onboarding flow across web and mobile",
                 "design the dashboard information architecture and navigation",
                 "build the design system components for every product surface"],
        "fable": ["define the long-term product vision and UX strategy for all surfaces",
                  "run a month of autonomous user research and redesign the core loop"],
    },
    "arts": {
        "haiku": ["resize the logo to 512x512 for the favicon", "convert the hero images to webp",
                  "crop the team photos to squares"],
        "sonnet": ["generate 3 logo concepts", "create the social images for the launch",
                   "produce the launch video storyboard", "illustrate the 4 feature cards",
                   "compose a 30-second background track for the demo"],
        "opus": ["create the complete brand identity: logo, palette, type and illustration style",
                 "produce the 60-second launch video with voiceover and motion graphics"],
        "fable": ["art-direct the entire brand universe and a multi-episode animated series"],
    },
}
# the last task in every (department, tier) list with >=3 items is held out for test_unseen
def task_pool(dept, tier, test):
    lst = TASKS[dept][tier]
    if len(lst) >= 3:
        return lst[-1:] if test else lst[:-1]
    return lst

DEPTS = list(TASKS)
TIERS = ["haiku", "sonnet", "opus", "fable"]

def pick_task(test, dept=None, tier=None):
    dept = dept or rng.choice(DEPTS)
    tier = tier or rng.choices(TIERS, weights=[3, 4, 2.5, 1.2])[0]
    return dept, tier, rng.choice(task_pool(dept, tier, test))

# ---------------------------------------------------------------- vendors: (train, test_unseen)
CRED_VENDORS = (
    [("GitHub", "GITHUB_TOKEN", "engineering"), ("OpenAI", "OPENAI_API_KEY", None), ("Stripe", "STRIPE_SECRET_KEY", "engineering"),
     ("AWS", "AWS_SECRET_ACCESS_KEY", "engineering"), ("Supabase", "SUPABASE_SERVICE_ROLE_KEY", "engineering"),
     ("Vercel", "VERCEL_TOKEN", "engineering"), ("SendGrid", "SENDGRID_API_KEY", "marketing"), ("Twilio", "TWILIO_AUTH_TOKEN", "engineering"),
     ("Notion", "NOTION_API_KEY", None), ("Slack", "SLACK_BOT_TOKEN", None), ("Linear", "LINEAR_API_KEY", "engineering"),
     ("Cloudflare", "CLOUDFLARE_API_TOKEN", "engineering"), ("Sentry", "SENTRY_AUTH_TOKEN", "engineering"),
     ("Resend", "RESEND_API_KEY", "marketing"), ("Buffer", "BUFFER_ACCESS_TOKEN", "marketing"),
     ("Replicate", "REPLICATE_API_TOKEN", "arts"), ("ElevenLabs", "ELEVENLABS_API_KEY", "arts"), ("Figma", "FIGMA_TOKEN", "product_design")],
    [("Datadog", "DD_API_KEY", "engineering"), ("Pinecone", "PINECONE_API_KEY", "engineering"), ("Mailchimp", "MAILCHIMP_API_KEY", "marketing"),
     ("HubSpot", "HUBSPOT_PRIVATE_APP_TOKEN", "marketing"), ("Shopify", "SHOPIFY_ADMIN_TOKEN", "engineering"),
     ("Airtable", "AIRTABLE_PAT", None), ("Mux", "MUX_TOKEN_SECRET", "arts"), ("PlanetScale", "PLANETSCALE_SERVICE_TOKEN", "engineering"),
     ("Runway", "RUNWAYML_API_SECRET", "arts"), ("Framer", "FRAMER_API_KEY", "product_design")],
)
SOCIAL = (["X", "TikTok", "Instagram"], ["LinkedIn", "Threads", "YouTube"])
OTHER_ACCOUNTS = (
    [("the Apple Developer Program", "a $99 payment and a D-U-N-S number", "engineering"),
     ("Google Play Console", "a $25 registration fee and ID verification", "engineering"),
     ("Product Hunt", "a CAPTCHA on the signup page", "marketing"), ("Reddit", "a phone number for verification", "marketing"),
     ("Canva Pro", "a credit card for the trial", "arts"), ("Shutterstock", "a payment method", "arts")],
    [("the Microsoft Partner Center", "a legal business identity check", "engineering"),
     ("Hacker News", "a CAPTCHA and email confirmation", "marketing"),
     ("Adobe Stock", "a card on file", "arts"), ("Dribbble Pro", "a payment and a phone check", "product_design")],
)
RATE_VENDORS = (["OpenAI", "the GitHub API", "the Anthropic API", "Google Maps", "the Notion API", "Replicate", "the X API"],
                ["the Reddit API", "the Shopify Admin API", "HubSpot", "Unsplash", "the YouTube Data API"])
BILL_VENDORS = (["OpenAI", "Vercel", "Replicate", "ElevenLabs", "Supabase", "Twilio", "Midjourney"],
                ["Runway", "Fly.io", "Render", "Pinecone", "Suno"])

# ---------------------------------------------------------------- helpers
DEADLINES = (["the launch is in 2 hours", "we demo at 5pm today", "this is due in 30 minutes", "the release is blocked on it",
              "YC demo day is tomorrow morning"],
             ["judges arrive at 4:30", "the press embargo lifts in an hour", "the board meeting starts at 3"])
SESS = lambda: f"sess_{rng.randrange(16**6):06x}"
UNIT = lambda tier: f"{rng.choice(['alpha', 'bravo', 'delta', 'echo', 'kilo', 'nova', 'orion', 'vega'])}-{rng.randint(1, 9)} ({tier})"

def fmt(event, fields, task, unit_tier, last, test):
    """Render a blocker as hook-payload text. Formats 0-2 are train-style; 3 (terse log) is held out for test."""
    style = rng.choice([0, 1, 2, 3, 3]) if test else rng.choice([0, 1, 2])
    unit = UNIT(rng.choice(TIERS))  # a random unit class: never the tier label
    if style == 0:
        lines = [f"hook: {event}"] + [f"{k}: {v}" for k, v in fields.items()] + [f"unit: {unit}", f"task: {task}"]
        if last: lines.append(f'last_assistant_message: "{last}"')
        return "\n".join(lines)
    if style == 1:
        d = {"hook_event_name": event, "session_id": SESS(), **fields, "unit": unit, "task": task}
        if last: d["last_assistant_message"] = last
        return json.dumps(d)
    if style == 2:
        head = f"{event} · " + " · ".join(f"{k}={v}" for k, v in fields.items())
        s = f"{head}\nUnit {unit} working on: {task}"
        return s + (f"\nAgent said: {last}" if last else "")
    # style 3: terse log line
    kv = " ".join(f"{k}={json.dumps(v) if isinstance(v, str) and ' ' in v else v}" for k, v in fields.items())
    s = f"[{rng.randint(10, 23)}:{rng.randint(10, 59)}:{rng.randint(10, 59)}] {unit} <{event}> {kv} | task=\"{task}\""
    return s + (f" | msg=\"{last}\"" if last else "")

def choose(pair, test):
    """Pick from the train half or the held-out half of a (train, test) pair of lists."""
    return rng.choice(pair[1] if test else pair[0])

def L(kind, quadrant, human_only, department, tier):
    return {"kind": kind, "quadrant": quadrant, "human_only": human_only, "department": department, "tier": tier}

# ---------------------------------------------------------------- scenario families
def credential(test):
    vendor, var, vdept = choose(CRED_VENDORS, test)
    dept, tier, task = pick_task(test, dept=vdept)
    msgs = ([f"I need a {var} to continue. Can you add it to .env?",
             f"The {vendor} call failed with 401 Unauthorized; {var} looks missing or expired.",
             f"Blocked: {var} is not set, so I can't authenticate to {vendor}.",
             f"I can't reach {vendor} without an API key. Please provide {var}."],
            [f"{vendor} rejected the request (invalid_api_key). Someone has to rotate {var} and drop it into the env file.",
             f"No {var} found in the environment, and the {vendor} SDK refuses to start without one."])
    last = choose(msgs, test)
    if rng.random() < 0.5:
        return "StopFailure", {"error": "authentication_failed"}, dept, tier, task, last, L("credential", "do_now", "yes", dept, tier)
    return "Notification", {"notification_type": "agent_needs_input", "message": f"Missing {var}"}, dept, tier, task, last, \
        L("credential", "do_now", "yes", dept, tier)

def account(test):
    deadline = rng.random() < 0.35
    dl = choose(DEADLINES, test) if deadline else None
    if rng.random() < 0.55:
        plat = choose(SOCIAL, test)
        dept = "marketing"
        _, tier, task = pick_task(test, dept="marketing")
        msgs = ([f"Signing up for {plat} requires a phone number and SMS code. I can't complete that.",
                 f"I tried to create our {plat} account but it's asking me to solve a CAPTCHA.",
                 f"To post the launch I need a {plat} business account. Their signup needs a human (phone verification).",
                 f"{plat} signup is stuck at identity verification; it needs a real person."],
                [f"Got to step 3 of the {plat} onboarding; it now wants a mobile number to text a code to.",
                 f"Can't make the {plat} page myself: the form hard-blocks automation and wants a verified human."])
    else:
        plat, need, vdept = choose(OTHER_ACCOUNTS, test)
        dept = vdept
        _, tier, task = pick_task(test, dept=dept)
        msgs = ([f"Creating an account on {plat} requires {need}. I need you to do this step.",
                 f"Blocked on signup for {plat}: it needs {need}.",
                 f"To continue I need access to {plat}, and registration requires {need}."],
                [f"{plat} registration stalls on {need}. Handing this one to a human.",
                 f"Signup wall at {plat} ({need}); I can't get past it on my own."])
    last = choose(msgs, test) + (f" Note: {dl}." if dl else "")
    ev = rng.choice([("Stop", {"stop_reason": "end_turn"}),
                     ("Notification", {"notification_type": "agent_needs_input", "message": "Claude needs your help"})])
    return ev[0], ev[1], dept, tier, task, last, L("account", "do_now" if deadline else "schedule", "yes", dept, tier)

READ_CMDS = (["ls -la src/", "git status", "git log --oneline -20", "cat package.json", "grep -rn TODO src/", "npm ls react",
              "curl -s https://api.github.com/repos/vercel/next.js", "find . -name '*.test.ts'", "npm install zod",
              "npx prettier --write src/pages/index.tsx", "python -m pytest -q tests/unit", "mkdir -p public/og"],
             ["du -sh node_modules", "git diff --stat HEAD~3", "jq '.scripts' package.json", "wc -l src/**/*.ts",
              "pnpm why typescript", "tree -L 2 app/"])
DESTR_CMDS = (["git push origin main", "git push --force origin release", "vercel deploy --prod", "rm -rf dist/ build/ .next/",
               "npm publish --access public", "psql $DATABASE_URL -c 'DROP TABLE sessions'", "gh pr merge 42 --squash",
               "aws s3 rb s3://launch-assets --force", "stripe refunds create --charge ch_3Nx", "fly deploy --app prod-api"],
              ["kubectl delete namespace staging", "terraform apply -auto-approve", "gh release create v1.0.0 --notes-file CHANGELOG.md",
               "heroku pg:reset DATABASE --confirm prod-app", "firebase deploy --only hosting"])
READ_TOOLS = (["Read(src/app/page.tsx)", "Glob(**/*.md)", "WebFetch(https://docs.stripe.com/api)", "Grep(pattern='useEffect')"],
              ["WebSearch(query='figma plugin api limits')", "Read(design/tokens.json)"])
EXTERNAL_TOOLS = (["mcp__x__post_tweet", "mcp__gmail__send_message", "mcp__slack__post_message", "mcp__buffer__publish_now"],
                  ["mcp__linkedin__create_post", "mcp__mailchimp__send_campaign", "mcp__discord__send_message"])

def approval(test):
    destructive = rng.random() < 0.5
    dept, tier, task = pick_task(test)
    if destructive:
        if dept == "marketing" and rng.random() < 0.6:
            tool = choose(EXTERNAL_TOOLS, test)
            inp = {"text": rng.choice(["We just launched C&C! Command your agent swarm like an RTS.", "Hi {first_name}, quick intro...",
                                       "Launch day! Link in bio."])}
        else:
            tool, inp = "Bash", {"command": choose(DESTR_CMDS, test)}
    else:
        if rng.random() < 0.7:
            tool, inp = "Bash", {"command": choose(READ_CMDS, test)}
        else:
            t = choose(READ_TOOLS, test)
            tool, inp = t.split("(")[0], {"arg": t.split("(", 1)[1].rstrip(")")}
    labels = L("approval", "schedule" if destructive else "delegate", "yes" if destructive else "no", dept, tier)
    if rng.random() < 0.6:
        return "PermissionRequest", {"tool_name": tool, "tool_input": json.dumps(inp)}, dept, tier, task, None, labels
    last = f"I need to run {tool} {json.dumps(inp)} next."
    return "Notification", {"notification_type": "permission_prompt", "message": f"Claude needs your permission to use {tool}"}, \
        dept, tier, task, last, labels

def rate_limit(test):
    vendor = choose(RATE_VENDORS, test)
    dept, tier, task = pick_task(test)
    msgs = ([f"{vendor} returned 429 Too Many Requests. Retry-After: 60.", f"Hit the rate limit on {vendor}; pausing before retrying.",
             f"API Error: 429 from {vendor}. Too many requests in the last minute.", f"{vendor} says 'slow down'. Backing off."],
            [f"Quota exceeded for requests-per-minute on {vendor}; the SDK suggests waiting 2 minutes.",
             f"Throttled by {vendor} (HTTP 429, x-ratelimit-remaining: 0)."])
    last = choose(msgs, test)
    err = rng.choice(["rate_limit", "rate_limit", "overloaded"])
    if err == "overloaded":
        last = rng.choice(["API Error: 529 Overloaded. The model is temporarily overloaded.", "Upstream model overloaded; will retry."])
    ev = rng.choice([("StopFailure", {"error": err}), ("Stop", {"stop_reason": "error"})])
    return ev[0], ev[1], dept, tier, task, last, L("rate_limit", "delegate", "no", dept, "haiku")

def billing(test):
    vendor = choose(BILL_VENDORS, test)
    dept, tier, task = pick_task(test)
    msgs = ([f"{vendor} returned 402 Payment Required: you have run out of credits.", f"Our {vendor} card was declined; the job was cancelled.",
             f"Credit balance is too low on {vendor}. Please top up to continue.", f"{vendor} plan limit reached; upgrade required."],
            [f"The {vendor} invoice is overdue so the workspace is read-only now.",
             f"{vendor}: 'insufficient funds on the billing account'. Nothing runs until someone pays."])
    last = choose(msgs, test)
    if rng.random() < 0.5:
        return "StopFailure", {"error": "billing_error"}, dept, tier, task, last, L("billing", "do_now", "yes", dept, tier)
    return "Stop", {"stop_reason": "end_turn"}, dept, tier, task, last, L("billing", "do_now", "yes", dept, tier)

QUESTIONS = {
    "engineering": (["Should the API return 404 or an empty list when there are no orders?", "Postgres or SQLite for the demo?",
                     "Do you want the retry logic in the client or the worker?"],
                    ["Is it OK to drop support for Node 18 in this change?"]),
    "marketing": (["Should the launch thread lead with the demo video or the problem statement?", "Which of the two taglines do you prefer?",
                   "Do we mention pricing in the launch email?"],
                  ["Formal or playful tone for the investor update?"]),
    "product_design": (["Should the pricing page show annual or monthly prices by default?", "Dark or light theme for the landing page?",
                        "Do you want social login on the signup screen?"],
                       ["Should onboarding be skippable?"]),
    "arts": (["Do you prefer the geometric or the hand-drawn logo direction?", "Should the video music be upbeat or ambient?",
              "Teal or orange as the primary brand color?"],
             ["Should the mascot be a robot or an animal?"]),
}
LEGAL_Q = (["What's the company's legal entity name and EIN for the W-9?", "I need you to e-sign the vendor terms before I can proceed.",
            "Which card should I use to pay for the domain?"],
           ["The registrar needs the registrant's legal name and home address.", "Please confirm the billing card for the annual plan."])

def missing_info(test):
    r = rng.random()
    dept, tier, task = pick_task(test)
    if r < 0.35:  # nothing specific
        deadline = rng.random() < 0.25
        dl = choose(DEADLINES, test) if deadline else None
        msg = rng.choice(["Claude is waiting for your input", "Claude has been idle for 60 seconds"]) if not test else \
            rng.choice(["Awaiting user response", "Session idle, waiting for input"])
        last = rng.choice(["Done with the first pass. Let me know what you'd like next.", "Anything else?",
                           "Ready when you are.", None])
        if dl: last = (last or "Waiting.") + f" Reminder: {dl}."
        return "Notification", {"notification_type": "idle_prompt", "message": msg}, dept, tier, task, last, \
            L("missing_info", "do_now" if deadline else "drop", "no", dept, "haiku" if not deadline else tier)
    if r < 0.8:  # a concrete question
        deadline = rng.random() < 0.3
        dl = choose(DEADLINES, test) if deadline else None
        last = choose(QUESTIONS[dept], test) + (f" ({dl})" if dl else "")
        ev = rng.choice([("Stop", {"stop_reason": "end_turn"}),
                         ("Notification", {"notification_type": "agent_needs_input", "message": "Claude has a question"})])
        return ev[0], ev[1], dept, tier, task, last, L("missing_info", "do_now" if deadline else "schedule", "no", dept, tier)
    last = choose(LEGAL_Q, test)  # legal identity / payment / signature
    return "Notification", {"notification_type": "agent_needs_input", "message": "Claude needs your input"}, dept, tier, task, last, \
        L("missing_info", "schedule", "yes", dept, tier)

DELIVERABLES = {  # department waited on -> [(tier, deliverable text)], (train, test)
    "arts": ([("haiku", "the resized logo files"), ("sonnet", "the logo from Arts"), ("sonnet", "the hero illustrations"),
              ("opus", "the full brand identity kit"), ("sonnet", "the launch video cut")],
             [("sonnet", "the OG share images from the art unit"), ("opus", "the finished motion-graphics trailer")]),
    "engineering": ([("sonnet", "the /api/pricing endpoint"), ("haiku", "the staging URL"), ("sonnet", "the auth flow merge"),
                     ("opus", "the multi-tenant schema migration"), ("sonnet", "the webhook handler PR")],
                    [("sonnet", "the backend team's search endpoint"), ("opus", "engineering's new event bus")]),
    "marketing": ([("sonnet", "the launch copy from Marketing"), ("haiku", "the final tweet wording"), ("sonnet", "the email sequence"),
                   ("opus", "the positioning doc")],
                  [("sonnet", "the press release draft from the growth unit")]),
    "product_design": ([("sonnet", "the landing page mockups"), ("sonnet", "the signup flow wireframes"), ("haiku", "the updated button spec"),
                        ("opus", "the redesigned onboarding flow")],
                       [("sonnet", "the Figma handoff for the pricing page"), ("opus", "design's new navigation IA")]),
}
DEP_MSGS = (["Waiting on {d} before I can continue.", "Blocked until {d} is ready.", "I can't finish this without {d}.",
             "Paused: this step depends on {d}."],
            ["Holding here; {d} hasn't landed yet.", "Nothing to do until {d} shows up in the repo."])

def dependency(test):
    waited = rng.choice(DEPTS)
    own = rng.choice([d for d in DEPTS if d != waited])
    dtier, deliv = choose(DELIVERABLES[waited], test)
    _, tier, task = pick_task(test, dept=own)
    last = choose(DEP_MSGS, test).format(d=deliv)
    ev = rng.choice([("Stop", {"stop_reason": "end_turn"}),
                     ("Notification", {"notification_type": "agent_needs_input", "message": "Blocked on dependency"})])
    return ev[0], ev[1], own, tier, task, last, L("dependency", "schedule", "no", waited, dtier)

FAILS = ([("sonnet", "npm test: 3 failing (checkout.spec.ts)"), ("sonnet", "tsc: error TS2322 in src/api/orders.ts"),
          ("sonnet", "Build failed: Module not found: Can't resolve '@/components/Hero'"), ("sonnet", "pytest: 2 failed, 41 passed"),
          ("sonnet", "ESLint found 12 errors; the CI lint step failed"), ("opus", "Circular dependency between core/auth and core/billing breaks the build"),
          ("opus", "Race condition: the queue worker and API both write the same order row"),
          ("opus", "The schema can't represent multiple workspaces per user; migrations conflict"),
          ("sonnet", "Vercel build failed: next build exited with code 1")],
         [("sonnet", "cargo test: 1 failed (parser::tests::handles_empty)"), ("sonnet", "go vet reports unreachable code in handlers.go"),
          ("opus", "Deadlock between the scheduler and the lease manager under load"),
          ("sonnet", "Playwright e2e: signup.spec timed out")])
PROD = (["on main", "in production", "on the release branch"], ["on the prod deploy", "in the hotfix branch"])

def failure(test):
    ftier, err = choose(FAILS, test)
    dept, tier, task = pick_task(test, dept=rng.choice(["engineering", "engineering", "product_design", "marketing"]))
    urgent = rng.random() < 0.4
    where = choose(PROD, test) if urgent else rng.choice(["locally", "on my branch", "in the feature branch"])
    dl = choose(DEADLINES, test) if urgent and rng.random() < 0.3 else None
    last = f"{err} ({where}). " + rng.choice(["Investigating.", "I tried twice and it still fails.", "Not sure how to proceed."]) \
        + (f" Also {dl}." if dl else "")
    ev = rng.choice([("Stop", {"stop_reason": "end_turn"}), ("StopFailure", {"error": "tool_error"})])
    return ev[0], ev[1], dept, tier, task, last, L("failure", "do_now" if urgent else "schedule", "no", "engineering", ftier)

FAMILIES = {"credential": credential, "account": account, "approval": approval, "rate_limit": rate_limit, "billing": billing,
            "missing_info": missing_info, "dependency": dependency, "failure": failure}

def make(n, test):
    rows, seen = [], set()
    while len(rows) < n:
        fam = rng.choice(list(FAMILIES))
        event, fields, dept, tier, task, last, labels = FAMILIES[fam](test)
        text = fmt(event, fields, task, tier, last, test)
        if text in seen: continue
        seen.add(text)
        rows.append({"id": f"{'t' if test else 'r'}{len(rows):04d}", "text": text, "fields": labels, "family": fam})
    return rows

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    pool = make(1000, test=False)
    test = make(260, test=True)
    rng.shuffle(pool)
    val, train = pool[:120], pool[120:]
    for name, rows in [("train", train), ("val", val), ("test_unseen", test)]:
        with open(OUT / f"{name}.jsonl", "w") as f:
            for r in rows: f.write(json.dumps(r) + "\n")
        print(name, len(rows))
