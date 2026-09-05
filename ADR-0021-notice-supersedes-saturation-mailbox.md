# Notice supersedes the saturation mailbox

The burst Resend mail (`Myro backend: read-latency saturation`) was a pager with no memory: 5 slow requests in 120s, 30-minute cooldown, then silence until the next burst. It could not tell a reopen from a new story, and it paged queue victims (`/users/me`) as if they were causes.

We retired it. A **Notice** (CONTEXT.md) is the record — `cause_key`, not route. Failures 1–6 open a row live (no email). A daily GitHub Action is the closer; one digest per run informs. Slow 200s stay off the catalog until 1–6 are stable.

We accepted a 23-hour gap with no pager in exchange for one operator truth. Live detection without live paging is deliberate: the row exists for the closer; the mailbox does not come back “for safety.”

**Considered and rejected:** keep both channels (two truths; the quieter dies); live-close every 500 onto `main` (deploy storm during capacity incidents); wait for a proving window before killing email (CEO chose simple: mailbox dies when Notice ships).
