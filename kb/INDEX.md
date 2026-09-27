# Knowledge base index (grep here BEFORE searching the web)

| Need | File |
|---|---|
| Schedule, brief, open questions | `kb/EVENT.md` |
| Kickoff talk: what each sponsor said they want (Granola summary + transcript) | `kb/raw/kickoff/` |
| **What to build and how (decisions, ideas, timeline, footguns)** | `kb/ARCHITECTURE.md` |
| Install/login checklist + smoke tests | `kb/SETUP.md` |
| Sponsor cheat sheets | `kb/sponsors/{gbrain,memorable,qm,superset,river,ufo}.md` |
| River full docs (md) | `kb/raw/river/*.md` (`python-api.md` = full reference) |
| River hackathon page + official example (`style_chat.py`) | `kb/raw/river/hackathon/` |
| Superset full docs | `kb/raw/superset-llms-full.txt` (grep `Source: https://docs.superset.sh/<page>`) |
| Memorable docs (CLI, API, integrations) | `kb/raw/memorable-*.md` |
| UFO docs | `kb/raw/ufo-docs*.md`, installer `kb/raw/ufo-install.sh` |
| GBrain / River / QM landing pages | `kb/raw/{gbrain,river,qm}-*.md` |
| GBrain free hackathon workspace (hosted, $50 credit, MCP URL) | `kb/raw/gbrain-hackathon.md` |
| **Source code + in-repo docs** (gitignored; `kb/fetch.sh`) | `kb/repos/{gbrain,qm,superset,ufo-core,gstack}` |

## Sponsor developer surfaces (verified Sep 27)
| Sponsor | Own MCP server | Public API | SDK | CLI | Docs for agents |
|---|---|---|---|---|---|
| GBrain | ✅ stdio + HTTP/OAuth, 7-verb spec | via MCP only | — | ✅ `gbrain` | ★ Most: repo llms.txt + llms-full (472KB), ~7.8MB docs, 229 skills |
| Superset | ✅ remote `api.superset.sh/mcp` | ✅ REST | ✅ TS `@superset_sh/sdk` (alpha) | ✅ | llms-full.txt (280KB), ~4MB repo docs, 30 skills |
| Memorable | ✅ read-only stdio (5 tools) | ✅ Extraction REST | — | ✅ `memorable` | llms.txt, ~6 doc pages, **hackathon kit** (prompt + reference builds) |
| River | — | ✅ via Python client + OpenAI-compatible serving | ✅ Python `river-client` | — | docs site, all 27 pages as .md (283KB); no public source |
| QM | client only | self-hosted HTTP (undocumented) | connector SDK | ✅ `qm` | repo only: ~1.7MB docs, 32 skills, ADRs; no site/llms.txt |
| UFO | client only | self-hosted HTTP (undocumented) | ✅ Python `ufo.sdk` (extensions) | ✅ `ufo`, `ufoctl` | 21 short user docs + repo `spec.md` (~0.9MB), 28 skills; no llms.txt |

## Best in-repo entry points
- GBrain: `kb/repos/gbrain/llms-full.txt`, `AGENTS.md`, `docs/protocol/MEMORY_VERBS_v1.md`, `docs/mcp/`
- QM: `kb/repos/qm/README.md`, `docs/memory-providers.md`, `docs/mcp-connectors.md`, `docs/deploy-directory.md`, `docs/swarms.md`, `.claude/skills/dev-instance/SKILL.md`
- UFO: `kb/repos/ufo-core/README.md`, `spec.md`, `extensions/sample`, `extensions/perplexity` (smallest), `extensions/gbrain`
- Superset: `kb/repos/superset` (monorepo; SDK/MCP docs are easier via the llms-full file)
- Memorable hackathon kit: `kb/repos/memorable-hackathon-kit/README.md`, `PROMPT.md`, `builds/*/agent.mjs`, `eval/run.mjs`
- gstack (Garry's Claude Code "software factory" skills, context for the software-factory idea): `kb/repos/gstack/README.md`

## Search recipes
```bash
grep -rn "create_deployment" kb/raw/river/          # River API usage
grep -n "Source: https://docs.superset.sh/sdk" kb/raw/superset-llms-full.txt
grep -rln "MEMORY_PROVIDER_CONFIG" kb/repos/qm/docs kb/repos/qm/src | head
```
