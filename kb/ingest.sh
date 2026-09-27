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
STAGE="$(mktemp -d)/ingest"
python3 - "$STAGE" <<'PY'
import sys
from pathlib import Path
S = Path(sys.argv[1]); root = Path('.')
SKIP = {'node_modules', '.git', 'fixtures', '__snapshots__', 'dist', 'build', '.next', '.turbo'}
TEST = {'test', 'tests', '__tests__', 'e2e'}
def safe(parts):  # gbrain import refuses `skills/` paths and skips dot-dirs
    return [('skill-docs' if p == 'skills' else 'dot-' + p[1:] if p.startswith('.') else p) for p in parts]
def put(src, rel):
    dest = S.joinpath(*safe(rel.parts))
    dest.parent.mkdir(parents=True, exist_ok=True)
    txt = src.read_text(errors='ignore')
    if src.suffix != '.md':
        txt = f"# {src.name}\n\n```\n{txt}\n```\n" if src.suffix == '.sh' else f"# {src.name}\n\n{txt}"
        dest = dest.with_name(dest.name + '.md')
    dest.write_text(txt)
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
