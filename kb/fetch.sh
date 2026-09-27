#!/usr/bin/env bash
# Re-fetch sponsor source repos (gitignored) and refresh the raw docs. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p repos raw/river
for r in garrytan/gbrain garrytan/gstack yc-software/qm superset-sh/superset ufo-ai/ufo-core MemorableOrg/memorable-hackathon-kit; do
  d="repos/${r#*/}"
  if [ -d "$d/.git" ]; then git -C "$d" pull --ff-only -q || true; else git clone --depth 1 -q "https://github.com/$r" "$d"; fi &
done; wait
curl -sL https://docs.superset.sh/llms-full.txt -o raw/superset-llms-full.txt
curl -sL https://docs.river.ai/llms.txt -o raw/river-llms.txt
grep -oE 'https://docs.river.ai/[^)]+\.md' raw/river-llms.txt | while read -r u; do
  curl -sL "$u" -o "raw/river/$(echo "${u#https://docs.river.ai/}" | tr / _)" & done; wait
echo "kb refreshed"
