// S3 Brains: headless Claude Code on the user's subscription (no API key).
// Every call runs `claude -p` from os.tmpdir() with hooks disabled, no MCP servers, no tools, no session
// persistence, so these calls never show up as units on the map and never load project MCP servers.
// Measured latency on the subscription (2026-09-27): haiku tiny prompt 2.3s; haiku classify/summary ~3-8s;
// sonnet commander (~3k-token digest) ~13.5s. GET /api/brains/stats shows live counts + last latency.
import { tmpdir } from "node:os";

export type ModelAlias = "haiku" | "sonnet" | "opus";
export interface LlmOpts { model?: ModelAlias; json?: boolean; timeoutMs?: number; system?: string; noCache?: boolean; urgent?: boolean }

const MAX_CONCURRENT = 3;
let active = 0;
const waiters: (() => void)[] = [];
const acquire = (urgent = false) => new Promise<void>((res) => {
  if (active < MAX_CONCURRENT) { active++; res(); return; }
  const w = () => { active++; res(); };
  if (urgent) waiters.unshift(w); else waiters.push(w); // commander / classification jump the summary queue
});
const release = () => { active--; const w = waiters.shift(); if (w) w(); };

const CACHE_MAX = 200;
const cache = new Map<string, string>();
const cacheGet = (k: string) => { const v = cache.get(k); if (v !== undefined) { cache.delete(k); cache.set(k, v); } return v; };
const cacheSet = (k: string, v: string) => { cache.set(k, v); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!); };

export const stats = { calls: 0, failures: 0, cacheHits: 0, lastLatencyMs: 0, queued: () => waiters.length, active: () => active };
export let disabled = false; // flips on if the `claude` binary is missing, so callers fall back to rules

const CLAUDE_BIN = Bun.which("claude") ?? "claude";

export async function claude(prompt: string, opts: LlmOpts = {}): Promise<string> {
  const model = opts.model ?? "haiku";
  const key = `${model}|${opts.system ?? ""}|${prompt}`;
  if (!opts.noCache) { const hit = cacheGet(key); if (hit !== undefined) { stats.cacheHits++; return hit; } }
  if (disabled) throw new Error("claude CLI unavailable");
  await acquire(opts.urgent);
  const t0 = Date.now();
  try {
    const args = [
      CLAUDE_BIN, "-p", "--model", model, "--output-format", "json",
      "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
      "--settings", '{"disableAllHooks":true}',
      "--tools", "", "--no-session-persistence", "--disable-slash-commands",
    ];
    if (opts.system) args.push("--system-prompt", opts.system);
    stats.calls++;
    const proc = Bun.spawn(args, {
      cwd: tmpdir(), stdin: new TextEncoder().encode(prompt), stdout: "pipe", stderr: "pipe",
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "cc-brains", CC_BRAINS: "1" },
    });
    const timeout = opts.timeoutMs ?? 45_000;
    const timer = setTimeout(() => { try { proc.kill(); } catch {} }, timeout);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited;
    clearTimeout(timer);
    stats.lastLatencyMs = Date.now() - t0;
    if (code !== 0 && !out.trim()) throw new Error(`claude exited ${code}${Date.now() - t0 >= timeout ? " (timeout)" : ""}: ${err.slice(0, 200)}`);
    let text = out;
    try {
      const env = JSON.parse(out);
      if (env.is_error) throw new Error(`claude error: ${String(env.result ?? env.subtype).slice(0, 200)}`);
      text = String(env.result ?? "");
    } catch (e: any) { if (String(e?.message).startsWith("claude error")) throw e; }
    text = text.trim();
    if (opts.json && !extractJson(text)) throw new Error(`no JSON in reply: ${text.slice(0, 120)}`);
    if (!opts.noCache) cacheSet(key, text);
    return text;
  } catch (e: any) {
    stats.failures++;
    if (/ENOENT|not found|No such file/i.test(String(e?.message))) disabled = true;
    throw e;
  } finally { release(); }
}

/** First balanced JSON object (or array) in a reply, tolerant of ```json fences and prose around it. */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = fence ? [fence[1], text] : [text];
  for (const src of candidates) {
    for (let i = 0; i < src.length; i++) {
      const open = src[i];
      if (open !== "{" && open !== "[") continue;
      const close = open === "{" ? "}" : "]";
      let depth = 0, inStr = false, esc = false;
      for (let j = i; j < src.length; j++) {
        const c = src[j];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            if (c !== close) break;
            try { return JSON.parse(src.slice(i, j + 1)); } catch { break; }
          }
        }
      }
    }
  }
  return null;
}

/** Convenience: ask for JSON, parse it, return null on any failure. */
export async function claudeJson<T = any>(prompt: string, opts: LlmOpts = {}): Promise<T | null> {
  try { return extractJson<T>(await claude(prompt, { ...opts, json: true })); } catch (e: any) { console.warn(`[brains] llm: ${String(e?.message ?? e).slice(0, 160)}`); return null; }
}
