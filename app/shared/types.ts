// C&C shared contract (v2). Owned by the main session. Slices: DO NOT edit. Ask for additive changes.
// Spec: app/SPEC.md. Server pushes WorldState over WS /ws at 4 Hz; clients send Commands to POST /api/command.

export type DeptId = "engineering" | "marketing" | "product_design" | "arts";
export type Tier = "haiku" | "sonnet" | "opus" | "fable" | "river" | "unknown";
export type PermissionMode = "default" | "acceptEdits" | "auto" | "plan" | "bypassPermissions" | "dontAsk" | "unknown";
export type UnitRole = "mothership" | "subagent" | "sentinel";
export type UnitStatus = "idle" | "working" | "acting" | "blocked" | "attacking" | "done" | "dead";
/** Eisenhower 2x2 (urgent x important). */
export type Quadrant = "do_now" | "schedule" | "delegate" | "drop";
export type EnemyKind = "credential" | "account" | "approval" | "rate_limit" | "billing" | "missing_info" | "dependency" | "failure";
export type Autonomy = "manual" | "assist" | "auto";
export type Stance = "hold" | "auto_attack" | "assist";

export interface Vec { x: number; y: number }

/** One orbit = one cycle. Sprint (repeating) or deadline (one-off). */
export interface Cycle {
  kind: "sprint" | "deadline";
  label: string;            // e.g. "Sprint 1 (1 wk)", "Hackathon submission 17:00"
  startAt: number;          // ms epoch
  endAt: number;            // ms epoch
}

export interface Planet {
  id: DeptId;
  name: string;             // "Engineering"
  color: string;            // "#RRGGBB" planet accent
  baseAngle: number;        // radians; cycle-end marker sits here
  orbitRadius: number;      // world units from the sun
  cycle: Cycle;
  progress: number;         // 0..1 through the current cycle
  pos: Vec;                 // server-computed: baseAngle + 2π·progress on the orbit
  colonization: 0 | 1 | 2 | 3; // barren → developed (driven by work + knowledge)
  knowledge: number;        // GBrain pages for this dept (slug namespace company/<dept>/)
  memTraffic: number;       // 0..1 recent memory read/write intensity (energy beam brightness)
  hidden?: boolean;
}

export interface Project {
  id: string;               // tag chosen at spawn, e.g. "cc-app", "gbrain-triage", "launch"
  name: string;
  color: string;            // unit tint; all units of a project share it
  planetId: DeptId;
}

export interface TokenUsage { input: number; output: number; cacheRead: number; cacheWrite: number }

export interface Unit {
  id: string;               // session_id, or `${session_id}:${agent_id}` for subagents
  sessionId: string;
  agentId?: string;
  agentType?: string;
  parentId?: string;        // mothership id for subagents
  role: UnitRole;
  planetId: DeptId;
  projectId: string;
  tier: Tier;
  model?: string;           // e.g. "claude-sonnet-5"
  permissionMode: PermissionMode;
  status: UnitStatus;
  label: string;            // short display name
  task?: string;            // first line of the current prompt
  taskSig?: string;         // normalized task signature (duration history key)
  charted: boolean;         // known route (ETA known) vs frontier (fog)
  etaMs: number | null;     // null = unknown (frontier)
  startedAt: number;
  progress: number;         // 0..1 distance travelled along its lane
  hp: number;               // 0..1 cosmetic remaining budget
  toolCount: number;
  failCount: number;
  lastTool?: string;
  lastToolInput?: string;
  lastEventAt: number;
  blockedBy?: string;       // enemy id
  attacking?: string;       // enemy id it was sent to
  pos: Vec;                 // server-computed world position
  home: Vec;                // where its lane starts (colony / mothership)
  target: Vec;              // objective position
  groups: number[];         // control groups 1..9
  tokens: TokenUsage;
  costUsd: number;
  contextUsed: number;      // tokens in the current context window
  contextWindow: number;    // e.g. 200000 or 1000000
  summary?: string;         // AI summary of what it's trying to do (Haiku)
  summaryAt?: number;
  transcriptPath?: string;
  workspaceId?: string;     // Superset workspace (for prompting)
  terminalId?: string;      // Superset terminal (for prompting)
  veteran?: boolean;        // charted via Memorable procedure
  hidden?: boolean;
  simulated?: boolean;
}

export interface Scored<T> { label: T; p: number; dist?: Record<string, number> }

export interface Classification {
  kind: Scored<EnemyKind>;
  quadrant: Scored<Quadrant>;
  humanOnly: Scored<boolean>;
  department: Scored<DeptId>;
  tier: Scored<Tier>;
  source: "sentinel" | "sentinel-base" | "fast" | "haiku" | "rules";
  latencyMs?: number;
}

export interface Enemy {
  id: string;
  causeKey: string;         // identical causes merge into one enemy
  title: string;            // e.g. "Needs GITHUB_TOKEN"
  reason: string;           // why units are blocked (tether label)
  kind: EnemyKind;          // silhouette
  quadrant: Quadrant;       // color/aura
  humanOnly: boolean;       // gold
  classification?: Classification;
  blocked: string[];        // unit ids blocked by it (strength)
  attackers: string[];      // unit ids sent to resolve it
  dependsOnUnit?: string;   // for kind=dependency: the unit being waited on
  strength: number;         // derived: blocked.length (+ slow growth with wait time)
  createdAt: number;
  planetIds: DeptId[];      // affected departments
  pos: Vec;                 // system edge near affected planets
  pendingPermission?: boolean;
  resolved?: boolean;       // set briefly for the explosion animation before removal
  hidden?: boolean;
  simulated?: boolean;
}

export interface Factory {
  id: string;
  planetId: DeptId;
  label: string;
  prompt: string;           // what each run asks an agent to do
  cadenceMs: number;
  nextRunAt: number;
  paused: boolean;
  runs: number;
  outputsPerDay: number;
  creditsPerDay: number;
  lastOutput?: string;
  pos: Vec;
  hidden?: boolean;
}

export interface Mine {
  id: string;               // "claude" | "river" | "gbrain"
  label: string;
  color: string;
  total: number;            // $ budget
  remaining: number;        // $
  burnPerDay: number;       // $/day
  measured: boolean;        // false = manual entry
  pos: Vec;                 // in the asteroid belt (south of the sun)
  hidden?: boolean;
}

export interface MemoryEvent { at: number; op: string; kind: "read" | "write"; slug?: string; unitId?: string; planetId?: DeptId }

export interface Knowledge { pages: number; facts: number; procedures: number; recent: MemoryEvent[] }

export interface RiverModel { id: string; checkpoint: string; base: string; createdAt: number; active: boolean; eval?: Record<string, unknown> }
export interface TrainingRun { id: string; status: "queued" | "running" | "done" | "failed"; startedAt: number; steps: { step: number; loss: number }[]; costUsd?: number; checkpoint?: string; message?: string }
export interface ResearchState {
  pos: Vec;                 // the research station near the sun
  models: RiverModel[];
  runs: TrainingRun[];
  corrections: number;      // human relabels not yet trained on
  sidecarUp: boolean;
  engine: "sentinel" | "sentinel-base" | "fast" | "haiku";
  card?: Record<string, unknown>; // app/river/card.json
}

/** Hide anything at every level (SPEC §3.8). */
export interface HideFilter { planets: DeptId[]; projects: string[]; units: string[]; enemies: string[]; layers: Layer[] }
export type Layer = "units" | "tethers" | "enemies" | "factories" | "mines" | "paths" | "beams" | "fog" | "labels" | "orbits" | "research";

/** Default view is deterministic; the commander agent can add views (highlight/hide/ping). */
export interface View { id: string; name: string; source: "default" | "commander"; highlight: string[]; hide: string[]; pings: string[]; createdAt: number }

export interface FeedItem { at: number; text: string; unitId?: string; enemyId?: string; level?: "info" | "warn" | "alert" }
export interface Advice { id: string; text: string; priority: number; action?: Command }

export interface WorldState {
  now: number;
  company: string;          // "C&C"
  planets: Planet[];
  projects: Project[];
  units: Unit[];
  enemies: Enemy[];
  factories: Factory[];
  mines: Mine[];
  research: ResearchState;
  knowledge: Knowledge;
  sunPulse: number;         // 0..1 recent memory activity (sun brightness)
  feed: FeedItem[];
  advice: Advice[];
  views: View[];
  activeViewId: string;     // "default" or a commander view
  filter: HideFilter;
  autonomy: Autonomy;
  stances: Record<number, Stance>; // control group → stance
  simulated: boolean;
  systemRadius: number;     // world units to the frontier edge
}

/** Claude Code hook payload (subset). Field names per code.claude.com/docs/en/hooks. */
export interface HookEvent {
  hook_event_name: string;
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  agent_id?: string;
  agent_type?: string;
  agent_transcript_path?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  tool_use_id?: string;
  error?: string;           // StopFailure / PostToolUseFailure
  error_details?: string;
  notification_type?: string;
  message?: string;
  title?: string;
  prompt?: string;          // UserPromptSubmit
  last_assistant_message?: string;
  result_summary?: string;
  // added by the server from HTTP headers / simulator
  _workspaceId?: string;
  _terminalId?: string;
  _simulated?: boolean;
  _ts?: number;
}

export type Command =
  | { type: "spawn"; planetId: DeptId; prompt: string; projectId?: string; tier?: Tier; name?: string; permissionMode?: PermissionMode }
  | { type: "prompt"; unitIds: string[]; text: string }
  | { type: "attack"; enemyId: string; unitIds: string[]; interrupt?: boolean }
  | { type: "deploy_for_enemy"; enemyId: string; tier: Tier }
  | { type: "resolve"; enemyId: string; note?: string }
  | { type: "correct"; enemyId: string; fields: Partial<{ kind: EnemyKind; quadrant: Quadrant; humanOnly: boolean; department: DeptId; tier: Tier }> }
  | { type: "group"; unitIds: string[]; group: number }
  | { type: "stance"; group: number; stance: Stance }
  | { type: "autonomy"; level: Autonomy }
  | { type: "add_view"; view: View }
  | { type: "set_view"; viewId: string }
  | { type: "filter"; filter: HideFilter }
  | { type: "factory_run"; factoryId: string }
  | { type: "factory_toggle"; factoryId: string; paused: boolean }
  | { type: "build_factory"; planetId: DeptId; label: string; prompt: string; cadenceMs: number }
  | { type: "research_retrain" }
  | { type: "research_promote"; modelId: string }
  | { type: "research_engine"; engine: ResearchState["engine"] }
  | { type: "commander"; text: string };

export interface CommandResult { ok: boolean; message: string; data?: unknown }

export interface RankEntry { unitId: string; score: number; reason: string } // score 0..100 (green high, red low)

export interface HistoryItem { ts: number; role: "user" | "assistant" | "tool"; kind: "prompt" | "text" | "tool_use" | "tool_result"; text: string; toolName?: string; isError?: boolean }
export interface UnitDetail { unitId: string; history: HistoryItem[]; filesInContext: string[]; memoryInContext: string[] }

export interface MemNode { id: string; slug: string; title: string; planetId?: DeptId; type?: string; updatedAt?: string }
export interface MemEdge { from: string; to: string; kind: "link" | "structural" }
export interface MemGraph { nodes: MemNode[]; edges: MemEdge[] }

export type ServerMsg =
  | { type: "state"; state: WorldState }
  | { type: "toast"; text: string; level?: "info" | "warn" | "alert" }
  | { type: "rank"; enemyId: string; entries: RankEntry[] }
  | { type: "commander"; text: string };

/** REST endpoints (all JSON):
 *  POST /hook                      Claude Code HTTP hooks (headers X-SS-Workspace / X-SS-Terminal)
 *  GET  /api/state                 WorldState snapshot
 *  POST /api/command               Command → CommandResult
 *  GET  /api/unit/:id              UnitDetail (history + context)          [S4 transcripts]
 *  GET  /api/rank/:enemyId         RankEntry[]                             [S3 brains]
 *  GET  /api/memory/graph          MemGraph                                [S6/S4 gbrain]
 *  GET  /api/memory/page?slug=     { slug, title, content }
 *  GET  /api/memory/search?q=      { results: { slug, title, snippet }[] }
 */
