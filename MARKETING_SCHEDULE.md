# Marketing schedule — the weekly rhythm and the gates

Set 2026-10-22. Shivam posts everything. Agents write the copy and never post.
Times are IST.

**What is drafted, planned and posted lives in the Distribution Tracker at
[himyro.com/admin/growth](https://www.himyro.com/admin/growth)**: one row per
post, with its date, copy and tracked link. Mark a post done there with its live
URL. This file only says when things go out and what each must pass first.

Which issue is next: [NEWSLETTER_QUEUE.md](NEWSLETTER_QUEUE.md). What a launch
video may show: [LAUNCH_VIDEOS.md](LAUNCH_VIDEOS.md).

## The week

| Day | IST | What | Where |
|---|---|---|---|
| Tue | 10:00 | Newsletter issue goes live | himyro.com/newsletter |
| Tue | 10:30 | That issue's post and thread | LinkedIn company page · X |
| Wed | 19:00 | That issue's carousel | Instagram |
| Thu | 10:00 | Launch video | LinkedIn, Shivam's profile |
| Sat | 10:00 | Same video as a reel | Instagram |

Newsletter posts go on the company page because their kits speak as "we". Launch
videos go on Shivam's profile, so the same post never sits on both within 7 days
(brand-guidelines `surfaces/linkedin.md`). Instagram goes on Saturday morning
because the brand guide names weekend mornings as the student segment's best window.

This is the floor: two LinkedIn, two Instagram, one issue a week. The brand guide
allows more. Add slots only once these hold for a month.

## Before anything goes out

- **Newsletter:** angle, chart and heading agreed with Shivam before drafting.
  When the issue ships, delete its NEWSLETTER_QUEUE row and add its posts to the
  tracker. Its copy lives in `scripts/newsletter-carousel-specs/issue-NNN-distribution.md`.
- **Launch video:** someone listens to the soundtrack first. Nobody had listened
  to any of the three as of 2026-10-22. An extension video waits for the store
  version. Its copy lives beside it in `brag-output*/linkedin.txt` and `instagram.txt`.
- **Copy:** the brand-guidelines surface file for the channel, then
  write-like-human. Both lints pass (`ai-tells-lint.mjs`, `lint-vocab.sh`).
  No prices, no counts except `loop_reach.py` with its date, no auto-apply.
- **Links:** every link carries `utm_source`, `utm_medium=social` and a
  `utm_campaign` per item (`brag-loop`, `issue-026`). Signup stores them
  (`frontend/lib/attribution.ts`), so each post's signups can be counted.
- **Outbox:** `.github/workflows/linkedin-outbox-publisher.yml` publishes any
  outbox file marked `Status: scheduled` to the company page once its time
  passes. Only Shivam sets `scheduled`.
