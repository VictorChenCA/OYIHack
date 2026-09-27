# company/: what the C&C agent company produces

C&C is run by its own agents. Each folder here is one **planet** (department) on the C&C map. The colonization
round (`app/scripts/colonize.ts`) launches one mothership per planet, and its subagents write their deliverables here.
Their knowledge also goes to GBrain under `company/<dept>/…`, which is what grows the planet and lights up the sun.

| Folder | Planet | Project tag | Mothership target |
|---|---|---|---|
| `engineering/` | Engineering | `gbrain-triage` | Triage of GBrain's 10 oldest open PRs (read-only) |
| `marketing/` | Marketing | `launch` | X launch thread, Show HN post, 30s TikTok script |
| `design/` | Product Design | `site` | Static landing page + 90s demo storyboard |
| `arts/` | Arts | `brand` | Logo, palette, OG image (SVG) |

End-of-cycle digests land in `<dept>/retros/<date>.md` via the GBrain `sprint-retro` skill (`app/gbrain-skills/sprint-retro`).
