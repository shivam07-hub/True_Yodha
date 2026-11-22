# Marketing schedule — the weekly rhythm and the gates

Set 2026-10-22. Shivam posts everything. Agents write the copy and never post.
Times are IST.

**Under review since 2026-11-22: [DISTRIBUTION_TEARDOWN.md](DISTRIBUTION_TEARDOWN.md).**
Months of posts brought 0 signups. Until Shivam answers its four decisions, nothing
posts from the backlog, and no post carries numbers read more than 7 days before it goes out.

**What is drafted, planned and posted lives in the Distribution Tracker at
[himyro.com/admin/growth](https://www.himyro.com/admin/growth)**: one row per
post, with its date, copy and tracked link. Mark a post done there with its live
URL. This file only says when things go out and what each must pass first.

Which issue is next: [NEWSLETTER_QUEUE.md](NEWSLETTER_QUEUE.md). What a launch
video may show: [LAUNCH_VIDEOS.md](LAUNCH_VIDEOS.md). The Instagram and LinkedIn
profiles, and Instagram's next posts: [INSTAGRAM_PROFILE.md](INSTAGRAM_PROFILE.md).

## The week

| Day | IST | What | Where |
|---|---|---|---|
| Tue | 10:00 | Newsletter issue goes live | himyro.com/newsletter |
| Tue | 10:30 | That issue's post | LinkedIn company page |
| Wed | 19:00 | That issue's carousel | Instagram |
| Thu | 10:00 | Launch video | LinkedIn, Shivam's profile |
| Sat | 10:00 | Same video as a reel | Instagram |

Newsletter posts go on the company page because their kits speak as "we". Launch
videos go on Shivam's profile, so the same post never sits on both within 7 days
(brand-guidelines `surfaces/linkedin.md`). Instagram goes on Saturday morning
because the brand guide names weekend mornings as the student segment's best window.

X is off the schedule (Shivam, 2026-11-02): 1 post, 0 followers, and every thread
is posted by hand. Revisit once LinkedIn and Instagram hold for a month.

This is the floor: two LinkedIn, two Instagram, one issue a week. The brand guide
allows more. Add slots only once these hold for a month.

**Until the backlog clears on Mon 23 Nov, one post a day on each channel**
(Shivam, 2026-11-17): LinkedIn at 10:30, Instagram at 19:00, reels and videos at
10:00. The day-by-day order is in [INSTAGRAM_PROFILE.md](INSTAGRAM_PROFILE.md),
under Next. After that, the week above.

## Before anything goes out

- **Newsletter:** angle, chart and heading agreed with Shivam before drafting.
- **Carousel:** Shivam agrees its storyline, the slide headlines in order,
  before the slides are built (NEWSLETTER_STANDARD.md, "Carousel: a story").
  When the issue ships, delete its NEWSLETTER_QUEUE row and add its posts to the
  tracker. Its copy lives in `scripts/newsletter-carousel-specs/issue-NNN-distribution.md`.
- **Ghost Index rates:** issue 023's posts quote them, and the index recomputes.
  Re-read the figures against `/ghost-index` before those posts go out. On
  19 Nov it still showed AB InBev, Palo Alto Networks and Barclays near the
  issue's rates, Cisco at 0% against the issue's 29.4%, and none of the other six.
- **Launch video:** someone listens to the soundtrack first. Nobody had listened
  to any of the three as of 2026-10-22. An extension video waits for the store
  version. Its copy lives beside it in `brag-output*/linkedin.txt` and `instagram.txt`.
- **Copy:** the brand-guidelines surface file for the channel, then
  write-like-human. Both lints pass (`ai-tells-lint.mjs`, `lint-vocab.sh`).
  No prices, no counts except `loop_reach.py` with its date, no auto-apply.
- **Links go to the product, never the newsletter** (Shivam, 2026-11-22). Every
  post sends people to the CV upload on `himyro.com`'s home page; the issue is
  the proof, the upload is the ask. Through 22 Nov, while posts pointed at the
  newsletter, 0 of the 11 attributed signups came from Instagram or LinkedIn.
  Every link carries `utm_source`, `utm_medium=social` and a `utm_campaign` per
  item (`brag-loop`, `issue-026`). Signup stores them
  (`frontend/lib/attribution.ts`), so each post's signups can be counted.
- **LinkedIn:** no link in the post body. It goes in the first comment, and the
  post carries the carousel as one PDF document (`issue-0NN-linkedin.pdf`
  beside the slides: a Page can boost a document post, never a multi-image
  post), the OG image or the video. The company page is
  posted from `linkedin.com/company/118214305/admin/` (the `himyro` slug
  redirected to an unavailable page when checked on 2026-06-02).
- **Instagram:** a carousel is published from the laptop with Publish to
  Instagram in the tracker (INSTAGRAM_PROFILE.md). Its caption is the slides'
  story, one line per slide and in slide order, folded into one caption. Its last
  slide carries `Upload your CV: himyro.com`; no slide names the newsletter. A reel
  keeps one caption of two lines. Three to five hashtags go in the first comment.
  The bio holds one fixed link, `https://www.himyro.com/?utm_source=instagram&utm_medium=social&utm_campaign=ig-bio`. Links change only in the app, so it
  never changes: Instagram signups count under `ig-bio`, not per post.
