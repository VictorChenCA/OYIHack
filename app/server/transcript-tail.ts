// S3 Brains: read the tail of a Claude Code transcript JSONL into a compact, prompt-sized digest.
// Fields: .type ("user"|"assistant"), .message.model, .message.id (dedupe), .message.content[] blocks
// (text | tool_use{name,input} | tool_result | thinking — skipped).
import { existsSync, openSync, readSync, fstatSync, closeSync } from "node:fs";

export interface TailItem { role: "user" | "assistant"; kind: "prompt" | "text" | "tool_use" | "tool_result"; text: string; toolName?: string }
export interface Tail { items: TailItem[]; model?: string; lastPrompt?: string }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function readTailBytes(path: string, maxBytes = 400_000): string {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    let s = buf.toString("utf8");
    if (start > 0) s = s.slice(s.indexOf("\n") + 1); // drop the partial first line
    return s;
  } finally { closeSync(fd); }
}

function toolInputText(input: any): string {
  if (!input || typeof input !== "object") return String(input ?? "");
  const v = input.command ?? input.file_path ?? input.url ?? input.query ?? input.pattern ?? input.description ?? input.prompt ?? input.slug;
  return clip(String(v ?? JSON.stringify(input)), 160);
}

export function readTail(path: string | undefined, maxRecords = 60): Tail | null {
  if (!path || !existsSync(path)) return null;
  let raw: string;
  try { raw = readTailBytes(path); } catch { return null; }
  const lines = raw.split("\n").filter(Boolean).slice(-maxRecords * 3);
  const items: TailItem[] = [];
  const seen = new Set<string>();
  let model: string | undefined, lastPrompt: string | undefined;
  for (const line of lines) {
    let r: any; try { r = JSON.parse(line); } catch { continue; }
    const msg = r?.message; if (!msg) continue;
    if (msg.model && msg.model !== "<synthetic>") model = msg.model;
    const content = msg.content;
    if (r.type === "user") {
      if (typeof content === "string") {
        if (content.startsWith("<") && /command-|system-reminder|local-command/.test(content.slice(0, 40))) continue;
        items.push({ role: "user", kind: "prompt", text: clip(content, 400) }); lastPrompt = content; continue;
      }
      if (Array.isArray(content)) for (const b of content) {
        if (b?.type === "text" && b.text && !String(b.text).startsWith("<")) { items.push({ role: "user", kind: "prompt", text: clip(b.text, 400) }); lastPrompt = b.text; }
        else if (b?.type === "tool_result") {
          const t = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.map((x: any) => x?.text ?? "").join(" ") : "";
          if (b.is_error) items.push({ role: "user", kind: "tool_result", text: "ERROR: " + clip(t, 160) });
        }
      }
      continue;
    }
    if (r.type === "assistant" && Array.isArray(content)) {
      const mid = msg.id ? `${msg.id}:${content.map((b: any) => b?.type).join(",")}:${content.length}` : undefined;
      if (mid && seen.has(mid)) continue; if (mid) seen.add(mid);
      for (const b of content) {
        if (b?.type === "text" && b.text?.trim()) items.push({ role: "assistant", kind: "text", text: clip(b.text.trim(), 300) });
        else if (b?.type === "tool_use") items.push({ role: "assistant", kind: "tool_use", toolName: b.name, text: `${b.name}(${toolInputText(b.input)})` });
      }
    }
  }
  return { items: items.slice(-maxRecords), model, lastPrompt };
}

/** Compact text for a prompt: the first user prompt in the window + the last N items, within ~maxChars. */
export function tailDigest(t: Tail, maxChars = 5000): string {
  const out: string[] = [];
  let used = 0;
  for (let i = t.items.length - 1; i >= 0; i--) {
    const it = t.items[i];
    const line = `${it.role === "user" ? "USER" : it.kind === "tool_use" ? "TOOL" : "AGENT"}: ${it.text.replace(/\s+/g, " ")}`;
    if (used + line.length > maxChars) break;
    out.unshift(line); used += line.length;
  }
  if (t.lastPrompt && !out.some((l) => l.startsWith("USER"))) out.unshift(`USER (task): ${clip(t.lastPrompt.replace(/\s+/g, " "), 400)}`);
  return out.join("\n");
}
