#!/usr/bin/env bash
# Import the whole KB (notes + raw docs) and every sponsor repo's markdown into the local GBrain (~/.gbrain).
# Keyword-indexed (--no-embed). Re-run after `bash kb/fetch.sh`. Needs the PGLite writer lock:
# no `gbrain serve` may be running (stop it with SIGTERM, then reconnect MCP with /mcp afterwards).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"
if pgrep -f "gbrain serve" >/dev/null; then
  echo "A gbrain serve holds the brain lock:"; pgrep -fl "gbrain serve"
  echo "Stop it (kill -TERM <pid>) and re-run."; exit 1
fi
STAGE="$PWD/kb/ingest-stage"   # not $TMPDIR: gbrain import silently exits 1 on /var/folders paths
rm -rf "$STAGE"
python3 - "$STAGE" <<'PY'
import sys
from pathlib import Path
S = Path(sys.argv[1]); root = Path('.')
SKIP = {'node_modules', '.git', 'fixtures', '__snapshots__', 'dist', 'build', '.next', '.turbo'}
TEST = {'test', 'tests', '__tests__', 'e2e'}
def safe(parts):  # gbrain import refuses `skills/` paths and skips dot-dirs
    return [('skill-docs' if p == 'skills' else 'dot-' + p[1:] if p.startswith('.') else p) for p in parts]
RENAME = {'readme.md': 'README-doc.md', 'index.md': 'index-doc.md', 'resolver.md': 'RESOLVER-doc.md'}  # gbrain import skips these names
MAX = 900_000  # split bigger files (gbrain's 2.6MB CHANGELOG is refused whole)
def put(src, rel):
    parts = safe(rel.parts)
    parts[-1] = RENAME.get(parts[-1].lower(), parts[-1])
    dest = S.joinpath(*parts)
    dest.parent.mkdir(parents=True, exist_ok=True)
    txt = src.read_text(errors='ignore')
    if src.suffix != '.md':
        txt = f"# {src.name}\n\n```\n{txt}\n```\n" if src.suffix == '.sh' else f"# {src.name}\n\n{txt}"
        dest = dest.with_name(dest.name + '.md')
    # docs that show gbrain's own facts/takes fence markers as examples fail to parse; neutralize them
    txt = txt.replace('<!--- gbrain:facts:', '<!--- example-gbrain-facts:').replace('<!--- gbrain:takes:', '<!--- example-gbrain-takes:')
    if len(txt) <= MAX:
        dest.write_text(txt); return
    chunks, cur = [], ''
    for line in txt.splitlines(keepends=True):
        if len(cur) + len(line) > MAX and cur: chunks.append(cur); cur = ''
        cur += line
    chunks.append(cur)
    for i, c in enumerate(chunks, 1):
        dest.with_name(f"{dest.stem}-part{i}.md").write_text(f"# {src.name} (part {i}/{len(chunks)})\n\n{c}")
put(root / 'CLAUDE.md', Path('oyihack/CLAUDE.md'))
for p in (root / 'kb').rglob('*'):
    if p.is_file() and 'repos' not in p.parts and p.suffix in ('.md', '.txt', '.sh'):
        put(p, Path('oyihack') / p)
for repo in sorted((root / 'kb/repos').iterdir()):
    for p in repo.rglob('*'):
        rel = p.relative_to(repo)
        if p.is_file() and not (set(rel.parts) & (SKIP | TEST)) and (p.suffix == '.md' or (p.suffix == '.txt' and p.name.startswith('llms'))):
            put(p, Path('sponsor-repos') / repo.name / rel)
print(f"staged {sum(1 for _ in S.rglob('*.md'))} files")
PY
gbrain import "$STAGE" --no-embed
