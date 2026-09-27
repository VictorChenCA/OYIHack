// C&C server: hooks → world → WebSocket. Owned by the main session. Slices extend it via server/plugins/*.ts only.
import index from "../web/index.html";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { Command, CommandResult, HookEvent, ServerMsg } from "../shared/types";
import type { AppConfig, Ctx, Plugin } from "./plugin";
import { World } from "./world";
import brains from "./plugins/brains";
import ops from "./plugins/ops";
import memory from "./plugins/memory";

const cfg: AppConfig = await Bun.file(new URL("../config.json", import.meta.url)).json();
const plugins: Plugin[] = [ops, brains, memory];
const world = new World(cfg);
const SAVE = new URL("../data/world.json", import.meta.url).pathname;
const LOG_PATH = () => new URL("../data/events.jsonl", import.meta.url).pathname;
world.restoreFrom(SAVE);
if (world.units.size === 0 && existsSync(LOG_PATH())) {
  // no saved world: rebuild real agents from the last 45 min of hook events (no side effects, durations not re-recorded)
  world.replaying = true; let n = 0;
  const cutoff = Date.now() - 45 * 60_000;
  for (const line of readFileSync(LOG_PATH(), "utf8").split("\n")) {
    if (!line) continue; try { const ev = JSON.parse(line); if (ev._simulated || (ev._ts ?? 0) < cutoff) continue; world.handle(ev); n++; } catch {}
  }
  world.replaying = false; if (n) world.log(`Rebuilt ${world.units.size} agents from ${n} recent events`);
}
setInterval(() => world.persistTo(SAVE), 5000);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { world.persistTo(SAVE); process.exit(0); });
const LOG = new URL("../data/events.jsonl", import.meta.url).pathname;

// env: process env first, then <repo>/.env (values never logged)
const dotenv: Record<string, string> = {};
const envPath = `${cfg.repoRoot}/.env`;
if (existsSync(envPath)) for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
  const v = m[2].split(" #")[0].trim().replace(/^["']|["']$/g, ""); if (v && !v.startsWith("#") && !v.endsWith("...")) dotenv[m[1]] = v;
}
const sockets = new Set<any>();
const broadcast = (msg: ServerMsg) => { const s = JSON.stringify(msg); for (const ws of sockets) ws.send(s); };

async function core(cmd: Command): Promise<CommandResult | undefined> {
  switch (cmd.type) {
    case "group": for (const id of cmd.unitIds) { const u = world.units.get(id); if (u) u.groups = [...new Set([...u.groups, cmd.group])]; } return { ok: true, message: `Group ${cmd.group}: ${cmd.unitIds.length} unit(s)` };
    case "stance": world.stances[cmd.group] = cmd.stance; return { ok: true, message: `Group ${cmd.group} stance: ${cmd.stance}` };
    case "autonomy": world.autonomy = cmd.level; return { ok: true, message: `Autonomy: ${cmd.level}` };
    case "add_view": world.views = [...world.views.filter((v) => v.id !== cmd.view.id), cmd.view]; world.activeViewId = cmd.view.id; return { ok: true, message: `View “${cmd.view.name}”` };
    case "set_view": world.activeViewId = cmd.viewId; return { ok: true, message: "" };
    case "filter": world.filter = cmd.filter; return { ok: true, message: "" };
  }
  return undefined;
}
async function dispatch(cmd: Command): Promise<CommandResult> {
  const results: CommandResult[] = [];
  const c = await core(cmd); if (c) results.push(c);
  for (const p of plugins) {
    try { const r = await p.onCommand?.(cmd, ctx); if (r) results.push(r); }
    catch (e: any) { results.push({ ok: false, message: `${p.name}: ${e?.message ?? e}` }); }
  }
  if (!results.length) return { ok: false, message: `No handler for ${cmd.type} yet` };
  const bad = results.find((r) => !r.ok);
  return bad ?? { ok: true, message: results.map((r) => r.message).filter(Boolean).join(" · "), data: results.find((r) => r.data)?.data };
}
const ctx: Ctx = { world, cfg, broadcast, env: (n) => process.env[n] || dotenv[n], command: dispatch };
for (const p of plugins) { try { await p.init?.(ctx); } catch (e) { console.error(`[${p.name}] init failed:`, e); } }

function ingest(ev: HookEvent) {
  try { appendFileSync(LOG, JSON.stringify({ ...ev, _ts: ev._ts ?? Date.now() }) + "\n"); } catch {}
  world.handle(ev);
  for (const p of plugins) { try { p.onHook?.(ev, ctx); } catch (e) { console.error(`[${p.name}] onHook:`, e); } }
}

const routeTable = plugins.flatMap((p) => Object.entries(p.routes ?? {}).map(([k, fn]) => { const [method, path] = k.split(" "); return { method, path, fn, name: p.name }; }));

const server = Bun.serve({
  port: cfg.port,
  development: true,
  idleTimeout: 60,
  routes: {
    "/": index,
    "/hook": { POST: async (req) => {
      try {
        const ev = (await req.json()) as HookEvent;
        ev._workspaceId ||= req.headers.get("x-ss-workspace") || undefined;
        ev._terminalId ||= req.headers.get("x-ss-terminal") || undefined;
        ingest(ev);
      } catch {}
      return Response.json({}); // no decision: agents proceed normally
    } },
    "/api/state": () => Response.json(world.snapshot()),
    "/api/command": { POST: async (req) => Response.json(await dispatch(await req.json())) },
  },
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws" && srv.upgrade(req)) return;
    for (const r of routeTable) {
      if (r.method !== req.method) continue;
      if (r.path.endsWith("/") ? url.pathname.startsWith(r.path) : url.pathname === r.path) {
        try { return await r.fn(req, url, ctx); } catch (e: any) { return Response.json({ error: String(e?.message ?? e) }, { status: 500 }); }
      }
    }
    return new Response("not found", { status: 404 });
  },
  websocket: { open: (ws) => { sockets.add(ws); ws.send(JSON.stringify({ type: "state", state: world.snapshot() })); }, close: (ws) => { sockets.delete(ws); }, message() {} },
});

setInterval(() => {
  world.tick();
  for (const p of plugins) { try { p.onTick?.(ctx); } catch (e) { console.error(`[${p.name}] onTick:`, e); } }
  broadcast({ type: "state", state: world.snapshot() });
}, 250);

console.log(`C&C on http://localhost:${server.port} · hooks → POST /hook · plugins: ${plugins.map((p) => p.name).join(", ")}`);
