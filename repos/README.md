# repos/ — the upstream repos Myro is built with

Every outside repo whose code, skills or rules we run lives in this list.
Clones sit in `repos/<name>/` and stay local (gitignored); this file is the
part every machine reads.

## Adding one

1. Read the whole repo before anything runs from it — license, scripts, what it fetches.
2. Clone into `repos/<name>/` and check out the commit you read: `git -C repos/<name> checkout <sha>`.
3. Add a row below. The pin is the commit you read, not `main`.
4. Updating = fetch, read the diff of the files we use, check out the new commit, bump the pin.

## The list

| Repo | What we use | Where it lands | License | Pin | Kept as |
|---|---|---|---|---|---|
| [latent-spaces/brag](https://github.com/latent-spaces/brag) | `/brag-slim` — launch video + share copy from a project or URL | `.claude/skills/myro-brag/` reads `repos/brag/skills/brag-slim/SKILL.md` each run | MIT | `069432ca` (2026-10-13) | clone here |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | Agent personas (all 184 in `~/.claude/agents/`) | `~/.claude/agents/` | MIT | `783f6a72` (2026-04-11) | clone at repo root `agency-agents/`, not moved |
| [mattpocock/skills](https://github.com/mattpocock/skills) | 21 skills: caveman, design-an-interface, domain-model, edit-article, git-guardrails-claude-code, github-triage, grill-me, improve-codebase-architecture, migrate-to-shoehorn, obsidian-vault, qa, request-refactor-plan, scaffold-exercises, setup-pre-commit, tdd, to-issues, to-prd, triage-issue, ubiquitous-language, write-a-skill, zoom-out | `.claude/skills/` | MIT | content hashes in `skills-lock.json` (local) | `npx skills add`, no clone |

## Not used from brag

The full `/brag` (Hyperframes via `npx`, bundled music) is not used: it runs
third-party code on every render and its music license is unverified by its
own README. Only `/brag-slim` is read.
