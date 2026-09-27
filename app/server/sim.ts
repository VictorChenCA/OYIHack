// Synthetic hook events for dev, the scale shot and demos. Everything it sends is marked _simulated (UI shows SIMULATED).
// Usage: bun server/sim.ts [sessions=12] [url=http://localhost:7777]
const N = Number(process.argv[2] ?? 12);
const URL_ = process.argv[3] ?? "http://localhost:7777";
const post = (ev: Record<string, unknown>) => fetch(`${URL_}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ev, _simulated: true }) }).catch(() => {});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const WORK: Record<string, string[]> = {
  engineering: ["Triage GBrain PR #1412 and write a verdict", "Fix the failing world reducer test", "Add the Superset spawn route", "Review GBrain PR #1398 for risk"],
  marketing: ["Draft the C&C launch thread for X", "Write a 30s TikTok script for launch", "Draft the Show HN post", "Build a list of 20 YC founders who post about agents"],
  product_design: ["Design the C&C landing page hero", "Storyboard the 90s demo video", "Spec the onboarding flow"],
  arts: ["Create the C&C logo in SVG", "Pick the brand palette", "Make the OG image"],
};
const TOOLS = ["Read", "Grep", "Bash", "Edit", "WebFetch", "mcp__gbrain-cloud__search", "mcp__gbrain-cloud__remember", "mcp__gbrain-cloud__put_page"];
const BLOCKERS = [
  { hook_event_name: "StopFailure", error: "authentication_failed", error_details: "GITHUB_TOKEN missing for gh pr comment" },
  { hook_event_name: "Stop", last_assistant_message: "I drafted the thread. To post it I need an X account; signing up requires a phone number." },
  { hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "git push origin HEAD" } },
  { hook_event_name: "StopFailure", error: "rate_limit", error_details: "429 Too Many Requests" },
  { hook_event_name: "Notification", notification_type: "idle_prompt", message: "Claude is waiting for your input" },
];

async function agent(i: number) {
  const planet = pick(Object.keys(WORK));
  const cwd = `/sim/sim-${planet}/w${i}`;
  const sid = `sim-${planet}-${i}-${Math.random().toString(36).slice(2, 6)}`;
  await post({ hook_event_name: "SessionStart", session_id: sid, cwd, permission_mode: "auto" });
  for (let round = 0; round < 4; round++) {
    await post({ hook_event_name: "UserPromptSubmit", session_id: sid, cwd, prompt: pick(WORK[planet]) });
    const subIds = Array.from({ length: Math.floor(Math.random() * 4) }, (_, k) => `a${k}${Math.random().toString(36).slice(2, 5)}`);
    for (const a of subIds) await post({ hook_event_name: "SubagentStart", session_id: sid, cwd, agent_id: a, agent_type: pick(["Explore", "general-purpose", "reviewer"]) });
    const steps = 6 + Math.floor(Math.random() * 14);
    let blocked = false;
    for (let s = 0; s < steps; s++) {
      const who = subIds.length && Math.random() < 0.6 ? { agent_id: pick(subIds) } : {};
      const tool = pick(TOOLS);
      await post({ hook_event_name: "PreToolUse", session_id: sid, cwd, tool_name: tool, tool_input: { command: tool === "Bash" ? "bun test" : "…", slug: `company/${planet.replace("_", "-")}/note-${s}` }, ...who });
      await sleep(700 + Math.random() * 2200);
      await post({ hook_event_name: Math.random() < 0.08 ? "PostToolUseFailure" : "PostToolUse", session_id: sid, cwd, tool_name: tool, ...who });
      if (!blocked && Math.random() < 0.1) {
        blocked = true;
        const b = Math.random() < 0.45 ? BLOCKERS[0] : pick(BLOCKERS); // a shared cause so enemies merge and grow
        await post({ ...b, session_id: sid, cwd });
        await sleep(8000 + Math.random() * 15000);
        await post({ hook_event_name: "UserPromptSubmit", session_id: sid, cwd, prompt: "Unblocked: continue" });
      }
    }
    for (const a of subIds) await post({ hook_event_name: "SubagentStop", session_id: sid, cwd, agent_id: a });
    await post({ hook_event_name: "Stop", session_id: sid, cwd, last_assistant_message: "Done." });
    await sleep(1500 + Math.random() * 4000);
  }
  await post({ hook_event_name: "SessionEnd", session_id: sid, cwd });
}
console.log(`Simulating ${N} agent sessions → ${URL_}`);
await Promise.all(Array.from({ length: N }, (_, i) => sleep(i * 350).then(() => agent(i))));
export {};
