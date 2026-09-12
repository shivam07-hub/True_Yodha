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
- `jobs.role_family` survives only as an internal step of the snapshot rebuild — never read
  by a consumer, never maintained per row by a trigger.
