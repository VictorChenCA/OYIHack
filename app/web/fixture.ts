// Deterministic-ish fixture world for offline UI work: open http://localhost:7777/?fixture
import type { DeptId, Enemy, Planet, Tier, Unit, WorldState } from "../shared/types";

const DEPTS: [DeptId, string, string][] = [["engineering", "Engineering", "#4FD1FF"], ["product_design", "Product Design", "#7C9CFF"], ["marketing", "Marketing", "#5CF2B0"]];
const TIERS: Tier[] = ["haiku", "sonnet", "opus", "fable"];
const polar = (r: number, a: number) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });

export function makeFixture(now: number): WorldState {
  const weekStart = now - 2 * 86_400_000;
  const planets: Planet[] = DEPTS.map(([id, name, color], i) => {
    const baseAngle = Math.PI + (i * 2 * Math.PI) / 3;
    const cycle = id === "engineering" ? { kind: "deadline" as const, label: "Hackathon submission 17:00", startAt: now - 3.5 * 3600e3, endAt: now + 2 * 3600e3 } : { kind: "sprint" as const, label: "Sprint 1 (1 wk)", startAt: weekStart, endAt: weekStart + 7 * 86_400_000 };
    const progress = (now - cycle.startAt) / (cycle.endAt - cycle.startAt);
    const orbitRadius = [900, 1050, 1150][i];
    return { id, name, color, baseAngle, orbitRadius, cycle, progress, pos: polar(orbitRadius, baseAngle + 2 * Math.PI * progress), colonization: ([3, 1, 2] as const)[i], knowledge: [42, 9, 17][i], memTraffic: [0.8, 0.2, 0.5][i], summary: ["Triaging GBrain PRs; one blocked on a GitHub token", "Landing page hero in progress", "Launch thread drafted; X signup needs a phone"][i] };
  });
  const units: Unit[] = [];
  planets.forEach((p, pi) => {
    for (let k = 0; k < [6, 3, 4][pi]; k++) {
      const id = `fx-${p.id}-${k}`, a = pi * 1.3 + k * 0.7, sub = k > 1;
      const target = k % 2 === 0 ? polar(Math.max(300, Math.hypot(p.pos.x, p.pos.y) - 260), Math.atan2(p.pos.y, p.pos.x) + (k - 2) * 0.1) : polar(1600, Math.atan2(p.pos.y, p.pos.x) + (k - 2) * 0.12);
      const t = ((now / 1000 + k * 7) % 60) / 60;
      units.push({
        id, sessionId: `fx-${p.id}`, role: sub ? "subagent" : "mothership", parentId: sub ? `fx-${p.id}-0` : undefined, planetId: p.id,
        projectId: ["cc-app", "design", "launch"][pi], tier: TIERS[(k + pi) % 4], model: "claude-sonnet-5", permissionMode: "auto",
        status: k === 3 && pi === 0 ? "blocked" : k % 4 === 1 ? "acting" : "working", label: `${p.name.slice(0, 3)}·${k}`,
        task: ["Triage GBrain PR #1412", "Landing page hero", "Draft the Show HN post"][pi], charted: k % 2 === 0,
        etaMs: k % 2 === 0 ? 240_000 : null, startedAt: now - 60_000, progress: t, hp: 1 - t * 0.6, toolCount: 12 + k, failCount: k % 3,
        lastTool: "Bash", lastToolInput: "bun test", lastEventAt: now, blockedBy: k === 3 && pi === 0 ? "fx-enemy-token" : undefined,
        pos: { x: p.pos.x + (target.x - p.pos.x) * t, y: p.pos.y + (target.y - p.pos.y) * t }, home: p.pos, target, groups: k === 0 ? [1] : [],
        tokens: { input: 12000, output: 3000, cacheRead: 90000, cacheWrite: 8000 }, costUsd: 0.42 + k * 0.1, contextUsed: 60_000 + k * 20_000, contextWindow: 200_000,
        summary: "Reviewing the diff for PR #1412; checking test coverage before writing a verdict to GBrain.", veteran: k === 0, simulated: true,
      });
    }
  });
  const enemies: Enemy[] = [
    { id: "fx-enemy-token", causeKey: "credential:GITHUB_TOKEN", title: "Needs GITHUB_TOKEN", reason: "gh pr comment needs a token", kind: "credential", quadrant: "do_now", humanOnly: true, blocked: units.filter((u) => u.blockedBy).map((u) => u.id).concat(["fx-engineering-4", "fx-engineering-5"]), attackers: [], strength: 3, createdAt: now - 90_000, planetIds: ["engineering"], pos: polar(1800, Math.PI * 1.05), simulated: true },
    { id: "fx-enemy-tiktok", causeKey: "account:tiktok", title: "Create TikTok account", reason: "Signup needs phone verification", kind: "account", quadrant: "schedule", humanOnly: true, blocked: ["fx-marketing-1"], attackers: [], strength: 1, createdAt: now - 30_000, planetIds: ["marketing"], pos: polar(1800, -0.2), simulated: true },
    { id: "fx-enemy-rate", causeKey: "rate_limit:anthropic", title: "Rate limited", reason: "429 from the API", kind: "rate_limit", quadrant: "delegate", humanOnly: false, blocked: ["fx-product_design-1"], attackers: [], strength: 1, createdAt: now - 10_000, planetIds: ["product_design"], pos: polar(1800, -Math.PI * 0.6), simulated: true },
  ];
  return {
    now, company: "C&C", planets,
    projects: [{ id: "cc-app", name: "C&C app", color: "#4FD1FF", planetId: "engineering" }, { id: "design", name: "C&C site", color: "#7C9CFF", planetId: "product_design" }, { id: "launch", name: "Launch campaign", color: "#5CF2B0", planetId: "marketing" }],
    units, enemies,
    factories: [{ id: "fx-f1", planetId: "engineering", label: "Nightly PR triage", prompt: "Triage new GBrain PRs", cadenceMs: 86_400_000, nextRunAt: now + 3_600_000, paused: true, runs: 2, outputsPerDay: 1, creditsPerDay: 1.8, pos: polar(430, Math.PI * 1.1) }],
    mines: [["claude", "Claude API", "#D97757", 50, 37.4], ["river", "River credits", "#40E0D0", 500, 488], ["gbrain", "GBrain credit", "#FFD166", 50, 46]].map(([id, label, color, total, remaining], i) => ({ id: id as string, label: label as string, color: color as string, total: total as number, remaining: remaining as number, burnPerDay: [22, 9, 3][i], measured: i === 0, pos: polar(380, Math.PI / 2 + (i - 1) * 0.35) })),
    research: { pos: polar(200, -Math.PI / 2 + 0.6), models: [{ id: "base", checkpoint: "Qwen/Qwen3.5-9B", base: "Qwen/Qwen3.5-9B", createdAt: now, active: false }], runs: [], corrections: 3, sidecarUp: false, engine: "haiku" },
    knowledge: { pages: 68, facts: 31, procedures: 4, recent: [{ at: now - (now % 9000), op: "remember", kind: "write", planetId: "engineering", unitId: "fx-engineering-0", text: "PR #1412 is safe to merge after the test fix" }] },
    sunPulse: 0.1, overview: "10 agents working across 3 teams · 1 blocker needs you (GitHub token) · 31 memories today",
    feed: [{ at: now, text: "fixture world", level: "info" }],
    advice: [{ id: "a1", text: "Needs you: 3 agents blocked by “Needs GITHUB_TOKEN”", priority: 10 }, { id: "a2", text: "1 agent idle in Marketing: assign a task", priority: 5 }],
    views: [{ id: "default", name: "Default", source: "default", highlight: [], hide: [], pings: [], createdAt: now }], activeViewId: "default",
    filter: { planets: [], projects: [], units: [], enemies: [], layers: [] }, autonomy: "assist", stances: { 1: "assist" }, simulated: true, systemRadius: 1900,
  };
}
