#!/usr/bin/env bash
# Refresh everything: pull sponsor repos (gitignored) and re-scrape sponsor docs into kb/raw. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p repos raw/river
for r in garrytan/gbrain garrytan/gstack yc-software/qm superset-sh/superset ufo-ai/ufo-core MemorableOrg/memorable-hackathon-kit; do
  d="repos/${r#*/}"
  if [ -d "$d/.git" ]; then
    before=$(git -C "$d" rev-parse --short HEAD)
    git -C "$d" pull --ff-only -q || echo "pull failed: $d"
    after=$(git -C "$d" rev-parse --short HEAD)
    [ "$before" = "$after" ] && echo "repo same: $d ($after)" || echo "repo UPDATED: $d $before -> $after"
  else
    git clone --depth 1 -q "https://github.com/$r" "$d" && echo "repo NEW: $d"
  fi
done
python3 scrape.py
echo "kb refreshed $(date '+%H:%M')"
