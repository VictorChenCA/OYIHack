// Server plugin contract. Owned by the main session. Each slice ships ONE plugin file under server/plugins/<name>.ts
// (plus its own helper modules). server/index.ts registers all plugins; slices never edit index.ts or world.ts.
import type {
  Command, CommandResult, Classification, DeptId, Enemy, Factory, FeedItem, HideFilter, HookEvent, Knowledge,
  MemoryEvent, Mine, ResearchState, ServerMsg, Stance, Unit, View, WorldState, Autonomy, Project,
} from "../shared/types";

export interface AppConfig {
  port: number;
  company: string;
  repoRoot: string;                       // absolute path of the OYIHack repo
  gbrain: { url: string; tokenEnv: string };          // product brain (gbrain-cloud) — stateless MCP over HTTP
  gbrainDev: { url: string; tokenEnv: string };       // dev KB brain (:3131)
  sentinelUrl: string;                    // River sidecar, e.g. http://127.0.0.1:7788
  supersetProjectId?: string;
  mines: { id: string; label: string; color: string; total: number; measured: boolean }[];
  planets: { id: DeptId; name: string; color: string; prefix: string[] }[]; // workspace/cwd prefixes → planet
  projects: Project[];
}

/** The world the reducer maintains. Plugins may read everything and call the mutators below. */
export interface WorldApi {
  units: Map<string, Unit>;
  enemies: Map<string, Enemy>;
  factories: Factory[];
  mines: Mine[];
  research: ResearchState;
  knowledge: Knowledge;
  views: View[];
  activeViewId: string;
  filter: HideFilter;
  autonomy: Autonomy;
  stances: Record<number, Stance>;
  projects: Project[];
  log(text: string, extra?: Partial<FeedItem>): void;
  snapshot(): WorldState;
  // mutators used by plugins
  applyClassification(enemyId: string, cls: Classification): void;   // S3: Sentinel/Haiku result → kind/quadrant/gold
  setSummary(unitId: string, summary: string): void;                  // S3: AI summary of a unit's context
  setUnitUsage(unitId: string, u: Pick<Unit, "tokens" | "costUsd" | "contextUsed" | "contextWindow" | "model" | "tier">): void; // S4 transcripts
  memoryEvent(ev: MemoryEvent): void;                                 // S4/S6: sun pulse + beam brightness
  setPlanetKnowledge(planetId: DeptId, pages: number): void;          // S4 gbrain counts
  markCharted(unitId: string, veteran: boolean): void;                // S4 memorable recall hit
  resolveEnemy(enemyId: string, note?: string): string[];             // returns unblocked unit ids
  attach(unitId: string, workspaceId?: string, terminalId?: string): void; // S4 superset mapping
  registerSpawn(s: { name: string; planetId: DeptId; projectId?: string; tier?: string; permissionMode?: string; workspaceId?: string; terminalId?: string }): void;
}

export interface Ctx {
  world: WorldApi;
  cfg: AppConfig;
  broadcast(msg: ServerMsg): void;
  env(name: string): string | undefined;   // reads process env, then <repo>/.env (never log values)
  command(cmd: Command): Promise<CommandResult>; // dispatch through all plugins (for commander / autonomy)
}

export type Route = (req: Request, url: URL, ctx: Ctx) => Response | Promise<Response>;

export interface Plugin {
  name: string;
  init?(ctx: Ctx): void | Promise<void>;
  /** Keys: "GET /api/unit/" (prefix match when it ends with "/"), "POST /api/commander", ... */
  routes?: Record<string, Route>;
  onHook?(ev: HookEvent, ctx: Ctx): void;          // after the world reducer handled it
  onTick?(ctx: Ctx): void;                          // 4 Hz
  /** Return a result if this plugin handled the command; undefined to pass. */
  onCommand?(cmd: Command, ctx: Ctx): Promise<CommandResult | undefined> | CommandResult | undefined;
}
