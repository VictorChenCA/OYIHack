// Light markdown → HTML: headings, bold/italic, inline code, fenced code, links, [[wikilinks]], lists, paragraphs.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string) {
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, slug, label) => `<a href="#" data-slug="${slug.trim()}">${label ?? slug}</a>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    if (/^https?:/.test(href)) return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
    return `<a href="#" data-slug="${href.replace(/^\/+|\.md$/g, "")}">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = []; let para: string[] = []; let list: "ul" | "ol" | null = null;
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      flushP(); flushL(); const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`); continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { flushP(); flushL(); const lv = Math.min(4, h[1].length + 1); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); continue; }
    const li = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(l);
    if (li) { flushP(); const kind = /\d/.test(li[1]) ? "ol" : "ul"; if (list !== kind) { flushL(); out.push(`<${kind}>`); list = kind; } out.push(`<li>${inline(li[2])}</li>`); continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { flushP(); flushL(); out.push("<hr>"); continue; }
    if (/^>\s?/.test(l)) { flushP(); flushL(); out.push(`<blockquote>${inline(l.replace(/^>\s?/, ""))}</blockquote>`); continue; }
    if (!l.trim()) { flushP(); flushL(); continue; }
    flushL(); para.push(l.trim());
  }
  flushP(); flushL();
  return out.join("\n");
}
