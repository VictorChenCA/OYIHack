#!/usr/bin/env python3
"""Re-scrape sponsor web pages into kb/raw/*.md (HTML -> readable text). Called by kb/fetch.sh.
Hand-curated mirrors (kb/raw/gbrain-hackathon.md, kb/raw/river/hackathon/, kb/raw/kickoff/) are never touched."""
import concurrent.futures as cf, html, os, re, urllib.request

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=25).read().decode("utf8", "ignore")

def to_text(s):
    m = re.search(r"<main.*?</main>", s, flags=re.S)
    if m: s = m.group(0)
    s = re.sub(r"data:[^\"')]+", "", s)
    s = re.sub(r"<script.*?</script>|<style.*?</style>|<svg.*?</svg>|<nav.*?</nav>|<footer.*?</footer>", "", s, flags=re.S)
    s = re.sub(r"<pre[^>]*>", "\n```\n", s); s = re.sub(r"</pre>", "\n```\n", s)
    s = re.sub(r"<(br|p|div|li|h[1-6]|tr)[^>]*>", "\n", s)
    t = html.unescape(re.sub(r"<[^>]+>", "", s))
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n\n", t).strip() + "\n"

PAGES = {
    "memorable-doc.md": "https://www.memorable.sh/doc",
    "memorable-cli.md": "https://www.memorable.sh/doc/cli",
    "memorable-api.md": "https://www.memorable.sh/doc/api",
    "memorable-integrate.md": "https://www.memorable.sh/doc/integrate",
    "memorable-gbrain.md": "https://www.memorable.sh/doc/gbrain",
    "memorable-qm.md": "https://www.memorable.sh/doc/qm",
    "memorable-usecase.md": "https://www.memorable.sh/use-case",
    "gbrain-home.md": "https://gbrain.io/",
    "gbrain-docs.md": "https://gbrain.io/docs",
    "gbrain-mcp.md": "https://gbrain.io/mcp",
    "gbrain-cli.md": "https://gbrain.io/cli",
    "gbrain-claude-code.md": "https://gbrain.io/works-with/claude-code",
    "gbrain-models.md": "https://gbrain.io/models",
    "river-home.md": "https://river.ai",
    "qm-home.md": "https://qm.ycombinator.com",
}
RAW_TEXT = {  # fetched verbatim (already markdown/text)
    "memorable-llms.txt": "https://www.memorable.sh/llms.txt",
    "superset-llms.txt": "https://docs.superset.sh/llms.txt",
    "superset-llms-full.txt": "https://docs.superset.sh/llms-full.txt",
    "river-llms.txt": "https://docs.river.ai/llms.txt",
    "ufo-install.sh": "https://ufo.ai/ufo",
}

def ufo_pages():
    idx = get("https://ufo.ai/docs/")
    paths = sorted(set(re.findall(r'href="(/docs/[^"#]*)"', idx)))
    return {("ufo-" + (p.strip("/").replace("/", "_") or "docs") + ".md"): "https://ufo.ai" + p for p in paths}

def save_page(item):
    name, url = item
    try:
        body = to_text(get(url)); out = f"Source: {url}\n\n{body}"
    except Exception as e:
        return f"FAIL {name}: {e}"
    path = os.path.join(RAW, name)
    old = open(path).read() if os.path.exists(path) else None
    if old == out: return f"same {name}"
    open(path, "w").write(out); return f"{'UPDATED' if old else 'NEW'} {name}"

def save_raw(item):
    name, url = item
    try: out = get(url)
    except Exception as e: return f"FAIL {name}: {e}"
    path = os.path.join(RAW, name)
    old = open(path).read() if os.path.exists(path) else None
    if old == out: return f"same {name}"
    open(path, "w").write(out); return f"{'UPDATED' if old else 'NEW'} {name}"

def river_md():
    idx = open(os.path.join(RAW, "river-llms.txt")).read()
    os.makedirs(os.path.join(RAW, "river"), exist_ok=True)
    return {os.path.join("river", u[len("https://docs.river.ai/"):].replace("/", "_")): u
            for u in re.findall(r"https://docs.river.ai/[^)]+\.md", idx)}

if __name__ == "__main__":
    pages = dict(PAGES)
    try: pages.update(ufo_pages())
    except Exception as e: print("FAIL ufo docs index:", e)
    with cf.ThreadPoolExecutor(16) as ex:
        results = list(ex.map(save_raw, RAW_TEXT.items())) + list(ex.map(save_page, pages.items()))
        results += list(ex.map(save_raw, river_md().items()))
    for r in sorted(results):
        if not r.startswith("same"): print(r)
    print(f"{sum(r.startswith('same') for r in results)} unchanged, {len(results)} checked")
