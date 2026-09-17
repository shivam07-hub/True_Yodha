# Decisions

One ADR, one decision, in force until another supersedes it. `docs/` is
gitignored **except this folder**, so this is the only place in `docs/` a new
file is visible to Codex, to CI and to a fresh clone.

Audited 2026-09-17: paths repointed, the Tutor/Mentor rename recorded, the
XP/Coins rename recorded, ADR-0022's contradiction with its own code resolved,
and four guards added to `backend/tests/test_adr_numbering.py` — one number per
decision, a Status on every ADR, and no pointer to a file that is not there.

**There is no ADR-0007.** Nothing was written and nothing was deleted; the
sequence skips it. A gap reads like a lost decision, so it is recorded here.

| # | Decision | Status |
|---|---|---|
| 0001 | Job feed: the crawler stays external, behind the Job Feed seam. Scanning lives there, not here. | Accepted |
| 0002 | Myro Score: three typed facades, not one orchestrator. (Table is still `mirror_scores`.) | Accepted |
| 0003 | View triad: Intel / Map / Audit | Accepted — label clause superseded by 0019 |
| 0004 | Every LLM-bearing action is charged; no time cooldowns. (XP is called **Coins** now.) | Accepted |
| 0005 | What Myro is not — the NOT-list | Accepted — item 7 amended 2026-09-17 (pay may be shown from a source, never estimated) |
| 0006 | Frictionless signup: OAuth + magic link; anonymous trial killed | Accepted |
| 0008 | Durable background work: Background Jobs, Work Lanes, Job Runner, Provider Budget | Accepted |
| 0009 | Progress-stream protocol over SSE | Accepted |
| 0010 | Web / mobile platform-shell seam | Accepted — C3 + C4 deferred |
| 0011 | Loading model: which loader for which wait | Accepted |
| 0012 | Location preference is multi-chip, OR-across, settings-owned | Accepted — migration applied, verified 2026-09-17 |
| 0013 | Myro **Mentor** is one agent over pluggable authored shelves | Accepted — renamed from Tutor |
| 0014 | Grounding is a hybrid retriever, not a general RAG engine | Accepted — renamed from Tutor |
| 0015 | A bounded tool-router, not an open agent loop | Accepted — renamed from Tutor |
| 0016 | Myro never fabricates CV content — it asks | Accepted — renamed from Tutor |
| 0017 | Frontier quality on the flagship, on the charged rail | Accepted — renamed from Tutor |
| 0018 | Referral intelligence: own connections + strategy, never stranger PII | Accepted — amended 2026-09-15 |
| 0019 | View-triad labels are per-page; semantics stay canonical | Accepted |
| 0020 | CV Artifact WYSIWYG contract | Accepted |
| 0021 | Notice supersedes the saturation mailbox | Accepted |
| 0022 | Closeness between skills, never the one bucket a job is in | Accepted — amended 2026-09-17 (recall is not a verdict) |
| 0023 | The Career Story Reservoir is the Master CV; one module decides story identity | Accepted |
| 0024 | One Career Ops evaluation per job; the direction decides who sees it | Accepted |

`sweep-tracking-issue-for-adr-0004.md` is a companion to 0004, deliberately
outside the numeric sequence — a number names a decision, not a work item.

## Writing one

Short. A decision someone can obey, the measurements that forced it, and what it
costs. If a claim cannot be checked in seconds, leave it out; if a pointer dies,
the paragraph says so in the same breath.
