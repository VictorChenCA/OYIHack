#!/usr/bin/env python3
"""Re-scrape sponsor web pages (no llms.txt available) into kb/raw/*.md. Called by fetch.sh.
Hand-written mirrors (raw/kickoff/, raw/river/hackathon/, raw/gbrain-hackathon.md) are never touched."""
import concurrent.futures as cf, html, re, sys, urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "raw"
PAGES = {
    "memorable-llms.txt": ("https://www.memorable.sh/llms.txt", False),
    "memorable-doc.md": ("https://www.memorable.sh/doc", True),
    "memorable-cli.md": ("https://www.memorable.sh/doc/cli", True),
    "memorable-api.md": ("https://www.memorable.sh/doc/api", True),
    "memorable-integrate.md": ("https://www.memorable.sh/doc/integrate", True),
    "memorable-gbrain.md": ("https://www.memorable.sh/doc/gbrain", True),
    "memorable-qm.md": ("https://www.memorable.sh/doc/qm", True),
    "memorable-usecase.md": ("https://www.memorable.sh/use-case", True),
    "gbrain-home.md": ("https://gbrain.io/", True),
    "gbrain-docs.md": ("https://gbrain.io/docs", True),
    "gbrain-mcp.md": ("https://gbrain.io/mcp", True),
    "gbrain-cli.md": ("https://gbrain.io/cli", True),
    "gbrain-claude-code.md": ("https://gbrain.io/works-with/claude-code", True),
    "gbrain-models.md": ("https://gbrain.io/models", True),
    "river-home.md": ("https://river.ai", True),
    "qm-home.md": ("https://qm.ycombinator.com", True),
    "ufo-install.sh": ("https://ufo.ai/ufo", False),
}
for p in ["", "getting-started/introduction/", "getting-started/setup/", "getting-started/ask/", "work/memory/",
          "work/tasks/", "work/web/", "work/terminal/", "connectors/", "connectors/slack/", "connectors/github/",
          "recipes/internal-application/", "recipes/code-change/", "recipes/data-analysis/",
          "workspace/permissions/", "workspace/billing/"]:
    PAGES["ufo-" + ("docs_" + p.strip("/").replace("/", "_") if p else "docs") + ".md"] = ("https://ufo.ai/docs/" + p, True)

def to_text(s):
    full = _clean(s)
    m = re.search(r"<main.*?</main>", s, flags=re.S)
    main = _clean(m.group(0)) if m else ""
    return main if len(main) > 0.6 * len(full) else full   # use <main> only when it holds most of the page

def _clean(s):
    s = re.sub(r'data:[^"\')]+', "", s)
    s = re.sub(r"<script.*?</script>|<style.*?</style>|<svg.*?</svg>|<nav.*?</nav>|<footer.*?</footer>", "", s, flags=re.S)
    s = re.sub(r"<pre[^>]*>", "\n```\n", s); s = re.sub(r"</pre>", "\n```\n", s)
    s = re.sub(r"<(br|p|div|li|h[1-6]|tr)[^>]*>", "\n", s)
    t = html.unescape(re.sub(r"<[^>]+>", "", s))
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n\n", t)

def fetch(item):
    name, (url, is_html) = item
    try:
        body = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=25).read().decode("utf8", "ignore")
    except Exception as e:
        return f"FAIL {name}: {e}"   # keep the old copy
    out = f"Source: {url}\n\n{to_text(body)}" if is_html else body
    if len(out) < 200:
        return f"SKIP {name}: suspiciously short ({len(out)} bytes), kept old copy"
    (RAW / name).write_text(out)
    return f"ok   {name} ({len(out)} bytes)"

with cf.ThreadPoolExecutor(12) as ex:
    results = list(ex.map(fetch, PAGES.items()))
print("\n".join(r for r in results if not r.startswith("ok")) or f"all {len(results)} web pages refreshed")
sys.exit(0)
