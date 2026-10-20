# Decisions

One ADR, one decision, in force until another supersedes it. `docs/` is
gitignored **except this folder**, so this is the only place in `docs/` a new
file is visible to Codex, to CI and to a fresh clone.

Audited 2026-09-17: paths repointed, the Tutor/Mentor rename recorded, the
XP/Coins rename recorded, ADR-0022's contradiction with its own code resolved,
and four guards added to `backend/tests/test_adr_numbering.py` — one number per
decision, a Status on every ADR, and no pointer to a file that is not there.

Audited 2026-10-19: stale facts corrected in 0001, 0004–0006, 0009–0013, 0015,
0017, 0019, 0022, 0023 and 0026; the pointer guard no longer excuses a paragraph for
naming the crawler, and a laptop path fails it. A scraper file is cited as
`myro-job-scraper/<path>`.

**Open — code contradicts an accepted ADR; ruling owed (Shivam):**
- 0006 — logged-out CV scoring (`/cv-preview`, `POST /public/score-cv`) and password signup are back.
- 0026 — the filing path (DECISIONS APPLY3, `job_filing_authorizations`) is not reconciled with "the extension stops before Submit".
- 0003 / 0019 — no page mounts `ViewTriadToggle`.
- 0015 — the tool router was never built; Mentor routes by surface.

**There is no ADR-0007.** Nothing was written and nothing was deleted; the
sequence skips it. A gap reads like a lost decision, so it is recorded here.

| # | Decision | Status |
|---|---|---|
| 0001 | Job feed: the crawler stays external, behind the Job Feed seam. Scanning lives there, not here. | Accepted — amended 2026-09-17, 2026-10-19 (the crawler is `myro-job-scraper`) |
| 0002 | Myro Score: three typed facades, not one orchestrator. (Table is still `mirror_scores`.) | Accepted |
| 0003 | View triad: Intel / Map / Audit | Accepted — label clause superseded by 0019 |
| 0004 | Every LLM-bearing action is charged; no time cooldowns. (XP is called **Coins** now.) | Accepted — facts amended 2026-10-19 (follow is free, ledger exists, coins can be bought) |
| 0005 | What Myro is not — the NOT-list | Accepted — item 7 amended 2026-09-17 (pay may be shown from a source, never estimated); stake restated 2026-09-30 |
| 0006 | Frictionless signup: OAuth + magic link; anonymous trial killed | Accepted |
| 0008 | Durable background work: Background Jobs, Work Lanes, Job Runner, Provider Budget | Accepted |
| 0009 | Progress-stream protocol over SSE | Accepted — amended 2026-10-19 (skill-edit is back on a poll) |
| 0010 | Web / mobile platform-shell seam | Accepted — C3 + C4 deferred; shell names corrected 2026-10-19 |
| 0011 | Loading model: which loader for which wait | Accepted — `TealField` is `AccentField` |
| 0012 | Location preference is multi-chip, OR-across, settings-owned | Accepted — migration applied, verified 2026-09-17 |
| 0013 | Myro **Mentor** is one agent over pluggable authored shelves | Accepted — renamed from Tutor; amended 2026-10-19 (Myrology ₹299, not a shelf) |
| 0014 | Grounding is a hybrid retriever, not a general RAG engine | Accepted — renamed from Tutor |
| 0015 | A bounded tool-router, not an open agent loop | Accepted — renamed from Tutor |
| 0016 | Myro never fabricates CV content — it asks | Accepted — renamed from Tutor; amended 2026-10-15 (the order is ADR-0026) |
| 0017 | Frontier quality on the flagship, on the charged rail | Accepted — renamed from Tutor |
| 0018 | Referral intelligence: own connections + strategy, never stranger PII | Accepted — amended 2026-09-15, 2026-10-06, 2026-10-15 |
| 0019 | View-triad labels are per-page; semantics stay canonical | Accepted |
| 0020 | CV Artifact WYSIWYG contract | Accepted |
| 0021 | Notice supersedes the saturation mailbox | Accepted — amended 2026-10-03, 2026-10-10, 2026-10-18 |
| 0022 | Closeness between skills, never the one bucket a job is in | Accepted — amended 2026-09-17 (recall is not a verdict), 2026-09-25, 2026-09-26 |
| 0023 | The Career Story Reservoir is the Master CV; one module decides story identity | Accepted — the onboarding CV reaches it since 2026-09-13 |
| 0024 | One Career Ops evaluation per job; the direction decides who sees it | Accepted |
| 0025 | One document per job — the newest row for that job is that job's CV | Accepted |
| 0026 | Every application follows one procedure: reflect the job, click and apply, two notes | Accepted |
| 0027 | The /market list is read until it is full, through one career-ops triage | Accepted — triage built; three replays failed the gate (recall 43% → 66% → 75%), not live |

`sweep-tracking-issue-for-adr-0004.md` is a companion to 0004, deliberately
outside the numeric sequence — a number names a decision, not a work item.

## Writing one

Short. A decision someone can obey, the measurements that forced it, and what it
costs. If a claim cannot be checked in seconds, leave it out; if a pointer dies,
the paragraph says so in the same breath.
