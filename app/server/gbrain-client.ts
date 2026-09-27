// Tiny stateless GBrain MCP-over-HTTP client (S6). Other slices may import it.
// POST tools/call with a bearer token; response is SSE (or JSON). result.content[0].text holds JSON (parsed twice).
// Never log token values.

export interface GBrainEndpoint { url: string; token?: string }

export class GBrainError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

let rpcId = 1;

/** Call one GBrain MCP tool. Returns the parsed JSON payload (or raw text if it isn't JSON). Throws GBrainError. */
export async function gbrainCall<T = unknown>(ep: GBrainEndpoint, name: string, args: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (ep.token) headers.authorization = `Bearer ${ep.token}`;
    const res = await fetch(ep.url, {
      method: "POST", headers, signal: ctl.signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } }),
    });
    const body = await res.text();
    if (!res.ok) throw new GBrainError(`http_${res.status}`, `${name}: HTTP ${res.status} ${body.slice(0, 200)}`);
    let msg: any = null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("event-stream") || body.startsWith("event:") || body.startsWith("data:")) {
      for (const line of body.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        try { const m = JSON.parse(line.slice(5).trim()); if (m && (m.result || m.error)) { msg = m; break; } } catch {}
      }
    } else {
      try { msg = JSON.parse(body); } catch {}
    }
    if (!msg) throw new GBrainError("bad_response", `${name}: unparseable response`);
    if (msg.error) throw new GBrainError("rpc_error", `${name}: ${msg.error.message ?? JSON.stringify(msg.error)}`);
    const result = msg.result ?? {};
    const text: string = result.content?.[0]?.text ?? "";
    let payload: any = text;
    try { payload = JSON.parse(text); } catch {}
    if (result.isError) {
      const code = (payload && typeof payload === "object" && payload.error) || "tool_error";
      const message = (payload && typeof payload === "object" && payload.message) || String(text).slice(0, 300);
      throw new GBrainError(String(code), `${name}: ${message}`);
    }
    return payload as T;
  } catch (e) {
    if (e instanceof GBrainError) throw e;
    if ((e as Error)?.name === "AbortError") throw new GBrainError("timeout", `${name}: timed out after ${timeoutMs}ms`);
    throw new GBrainError("network", `${name}: ${(e as Error)?.message ?? String(e)}`);
  } finally { clearTimeout(timer); }
}

/** Bind an endpoint once. */
export function gbrain(ep: GBrainEndpoint) {
  return { call: <T = unknown>(name: string, args: Record<string, unknown> = {}, timeoutMs?: number) => gbrainCall<T>(ep, name, args, timeoutMs), ep };
}
