# Notice supersedes the saturation mailbox

**Status:** Accepted
**Date:** 2026-09-13

The burst Resend mail (`Myro backend: read-latency saturation`) was a pager with no memory: 5 slow requests in 120s, 30-minute cooldown, then silence until the next burst. It could not tell a reopen from a new story, and it paged queue victims (`/users/me`) as if they were causes.

We retired it. A **Notice** (CONTEXT.md) is the record — `cause_key`, not route. Failures 1–7 open a row live (no email). A daily GitHub Action harvests and sends one digest. Cursor authors the close. OpenRouter is the user-facing LLM path and is not in this loop.

We accepted a 23-hour gap with no pager in exchange for one operator truth. The Action does not need the laptop. The PR can wait until Cursor is open. Skill-floor Resend is the same mailbox and died with it.

**Considered and rejected:** keep both channels (two truths; the quieter dies); live-close every 500 onto `main` (deploy storm during capacity incidents); wait for a proving window before killing email (CEO chose simple: mailbox dies when Notice ships); have the Action call OpenRouter to write the patch (wrong budget, wrong author).

**Amended 2026-10-03.** A slow 2xx inside the read budget was always filed as a capacity-queue victim and parked `blocked`. Two of them were single unindexed queries (`/jobs/feed-state` 12.3s, `/jobs/at` 10.6s) hiding among 10,095 parked sightings. The transport now times each round trip; a slow 2xx whose own trip took ≥500ms opens `slow_200:slow_read:<file>:<function>`, identified like an unhandled 500 by the app frame that asked. Route is still never the identity. Only a slow 2xx with no slow trip stays a queue victim.
