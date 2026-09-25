# Myro stores closeness between skills, never the one bucket a job or skill belongs to

Status: accepted
Date: 2026-09-12

Every "what kind of work is this" question used to be answered by putting a row in one
bucket: a job took the modal Lightcast L2 cluster of its own skills (`jobs.role_family`).
Measured on prod, 2026-09-09..12 — the winning cluster held **26%** of a job's specific
skills, tied with its runner-up on **45.7%** of live jobs (the alphabet broke the tie), and
**64.9%** of identical (company, exact-title) posting groups landed in more than one
family, worst case 58.

The cause: jobs ask for skills that go together, and the taxonomy groups skills by what
they *are*. Skill pairs that jobs ask for together are **17.3× likelier than chance**, and
**90.6%** of those bonds cross L2 clusters once single-employer templates are removed
(67.4% of raw bonds were one employer's template). Users' own skills show the same shape.

Building *better* buckets fails identically. The skills holding the bond graph together are
Python, SQL, Java and Git — each belongs to backend, data and ML work at once. A first-cut
clustering put 46% of all skills in one group.

## Decision

No job and no skill is stored as a member of one bucket. Myro stores **closeness between
skills**, learned from live jobs and counted across companies, and every fit is a **graded
score computed from skills**: person↔direction, job↔direction, person↔next skill. A
direction is a named skill profile, not a container.

## Consequences

- A job appears under every direction it fits. Per-direction open counts rise (Software
  Development 2,271 → 2,949) and a Python+PostgreSQL job counts in both Scripting Languages
  and Databases — which is true.
- Measured Pareto gain for job↔direction: "asks for ≥2 of the direction's 12 characteristic
  skills" scores 76% precision / 40% reach against the bucket's 71% / 29%.
- **Supersedes D2 of the 2026-07-31 role-family grill** ("families = the modal L2 cluster of
  each job's skills"). D2's premise holds for ranking a person against directions; it fails
  for placing a job.
- `jobs.role_family` is not the answer to any fit question. It survives as a **recall
  index** and nothing else — see the amendment below.

## Amended 2026-09-17 — recall is not a verdict

As accepted, this ADR said `role_family` was "never read by a consumer". That was
untrue the day it was written and is untrue now: three consumers read it — the
feed's role signal (`_role_match_score`), the matcher's boost (`job_matcher`),
and the candidate-pool family selector (`get_candidate_job_ids_for_roles`). An
accepted ADR that contradicts the code it governs teaches the next reader to
trust neither.

The rule it was reaching for, stated so it can be obeyed:

- **Recall** — which jobs are worth looking at — may use the bucket. It is one
  indexed equality over 46,801 rows, and being approximately right about what to
  fetch costs nothing.
- **A verdict** — does this job fit this person's direction — is always graded
  from skills (`matching/direction_fit`: the job asks for 2 or more of the
  direction's 12 most-demanded skills). Never the bucket, on any surface.

Everything a user sees or the gate acts on is a verdict: the card's Pivot tag,
the pick gate, the reach fill, the /market warm's shortlist, and `passed_on`.

**What retires the column.** Grading the whole corpus per request measures
5.8–23.2s on the shared instance (BACKLOG #46 S4), so recall stays indexed until
the `role_family_pool(family, job_id, matched)` snapshot can be built — the same
paid-compute gate as #16. When the selector and the feed signal both read that
snapshot, `role_family`, `role_family_for_job` and `trg_refresh_job_role_family`
retire together, and this amendment goes with them.

## Amended 2026-09-25 — the shortlist's verdict is the grade

`candidates_for_user` was still answering the fit question with the bucket:
`on_direction` was `role_family` equality, and the score added 6 for the same
equality. Both now stop at recall. The score that cuts the corpus is skill
overlap and freshness. `shortlist_jobs` grades the rows that cut already
returned — `main_skills` against the direction's `core_skills`, both already
in memory — and that grade is the card's `on_direction` and the +6 that
moves an on-direction job ahead of a higher raw score. The corpus-wide
`role_family_pool` snapshot is still not built.
