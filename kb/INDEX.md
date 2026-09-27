# Knowledge base index (grep here BEFORE searching the web)

| Need | File |
|---|---|
| Schedule, brief, open questions | `kb/EVENT.md` |
| **What to build and how (decisions, ideas, timeline, footguns)** | `kb/ARCHITECTURE.md` |
| Install/login checklist + smoke tests | `kb/SETUP.md` |
| Sponsor cheat sheets | `kb/sponsors/{gbrain,memorable,qm,superset,river,ufo}.md` |
| River full docs (md) | `kb/raw/river/*.md` (`python-api.md` = full reference) |
| Superset full docs | `kb/raw/superset-llms-full.txt` (grep `Source: https://docs.superset.sh/<page>`) |
| Memorable docs (CLI, API, integrations) | `kb/raw/memorable-*.md` |
| UFO docs | `kb/raw/ufo-docs*.md`, installer `kb/raw/ufo-install.sh` |
| GBrain / River / QM landing pages | `kb/raw/{gbrain,river,qm}-*.md` |
| **Source code + in-repo docs** (gitignored; `kb/fetch.sh`) | `kb/repos/{gbrain,qm,superset,ufo-core,gstack}` |

## Best in-repo entry points
- GBrain: `kb/repos/gbrain/llms-full.txt`, `AGENTS.md`, `docs/protocol/MEMORY_VERBS_v1.md`, `docs/mcp/`
- QM: `kb/repos/qm/README.md`, `docs/memory-providers.md`, `docs/mcp-connectors.md`, `docs/deploy-directory.md`, `docs/swarms.md`, `.claude/skills/dev-instance/SKILL.md`
- UFO: `kb/repos/ufo-core/README.md`, `spec.md`, `extensions/sample`, `extensions/perplexity` (smallest), `extensions/gbrain`
- Superset: `kb/repos/superset` (monorepo; SDK/MCP docs are easier via the llms-full file)
- gstack (Garry's Claude Code "software factory" skills, context for the software-factory idea): `kb/repos/gstack/README.md`

## Search recipes
```bash
grep -rn "create_deployment" kb/raw/river/          # River API usage
grep -n "Source: https://docs.superset.sh/sdk" kb/raw/superset-llms-full.txt
grep -rln "MEMORY_PROVIDER_CONFIG" kb/repos/qm/docs kb/repos/qm/src | head
```
