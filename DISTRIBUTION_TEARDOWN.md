# Distribution teardown — why posts bring no one, and what replaces them

Written 2026-11-22 after Shivam asked why months of posting have produced no
traffic. Every number below was read on 22 Nov from the live pages, the
tracker and the database. Decisions waiting on Shivam are at the end.

## What the posts actually got

| Channel | Audience | Typical post | Best post | Signups ever (UTM) |
|---|---|---|---|---|
| LinkedIn company page | 27 followers | 5–21 impressions (76 in the last 30 days, all posts together) | Issue 024: 16 impressions, 1 reaction | 0 |
| Shivam's own LinkedIn | 2,921 followers | 400–1,900 impressions | "MNC hiring is not in Hyderabad, it is Pune": 1,896. Capgemini job list: 1,690. First newsletter: 1,483 | not tagged |
| Instagram @myrojobs | 53 followers | 3–8 likes, mostly our own circle | Loop reel: 8 likes | 0 |

All 11 signups with attribution since June came from chatgpt.com. None came
from Instagram or LinkedIn. Shivam's profile reaches 50 to 100 times what the
page reaches, and it has not posted in three months.

## Why it isn't working, most damaging first

1. **We post where nobody is.** Every LinkedIn post since October went on a
   27-follower page. Pages reach about 1–2% of followers organically
   ([Agility PR](https://www.agilitypr.com/pr-news/branding-reputation/the-company-page-is-dead-long-live-the-expert/),
   [SocialPilot](https://www.socialpilot.co/blog/linkedin-algorithm)). The
   rule that put them there (MARKETING_SCHEDULE: "the kits speak as we") chose
   grammar over reach.
2. **The data is old by the time it posts.** 021 is a 9 September read, 023
   runs through 24 September, 025 is 20 October, all queued for late
   November. A dated, stale number reads as untrustworthy. The database is not
   the problem: 74,386 roles were verified live on employers' pages in the
   last 7 days, 39,148 of them today. The pipeline cuts posts from
   issues instead of from this week's data.
3. **Posts were newsletter excerpts with a newsletter link.** Fixed today
   (commit `8022a1de`): links now go to the CV upload. Until 22 Nov every
   post asked people to go and read more, not to use Myro.
4. **No person.** The pages that win in our niche are people. career__adit
   (825K): his face, one job-seeker question per post ("Is employment bond
   valid?", "Tell me about your background: how to answer"). Shivam's own data
   posts outperform the page by 50×. @myrojobs and the page are logos.
5. **Posts answer our question, not theirs.** A carousel about "risk and
   compliance by employer type" is our analysis. What people send to a friend
   is a concrete opening or a fix: Internshala's posts (122K) are "150 Field
   Sales Intern openings at Amar Ujala, ₹12,000 + incentives". Shivam's
   Capgemini job list got 1,690 impressions. We hold 74K verified-live roles
   and post percentages about them.
6. **We measured slots posted, not reach.** "Consistency" counted posts that
   went out. A slot posted to 27 people is a slot that did nothing.

## What the platforms reward (2026)

- **Instagram:** watch time, likes per reach and sends per reach are the top
  signals; sends matter most for reaching non-followers. A carousel someone
  scrolls past gets a second showing on slide 2
  ([Buffer](https://buffer.com/resources/instagram-algorithms/),
  [ZoomSphere on Mosseri](https://www.zoomsphere.com/blog/instagram-algorithm-2026-what-actually-gets-reach)).
  Carousels of 7–10 slides do best among carousels
  ([PostEverywhere](https://posteverywhere.ai/blog/instagram-carousel-best-practices)).
- **LinkedIn:** dwell time and comments over likes; documents hold dwell;
  outbound links in the post cost reach, so the link goes in the first comment
  ([Dataslayer](https://www.dataslayer.ai/blog/linkedin-algorithm-february-2026-whats-working-now),
  [SocialPilot](https://www.socialpilot.co/blog/linkedin-algorithm)).
  Career and salary content is one of the strongest categories in India
  ([Ylytic](https://www.ylytic.com/blog/blog-linkedin-benchmarks-2026)).
  These are vendor studies; the direction agrees, the multipliers do not.

## Cut

| Cut | Why |
|---|---|
| The late-November backlog of 021, 023 and 025 as dated issues | Their numbers are 1–2.5 months old. Post them only with this week's read, or not at all |
| The company page as the LinkedIn channel | 27 followers, 5–21 impressions. It reshares Shivam's post instead |
| "Newsletter" anywhere in a post | Done 22 Nov |
| Counting slots as the measure | Replaced by reach, sends/saves, link clicks and signups per post |
| Building more posting automation (#64 B6/B7, Publish to Instagram) before a post reaches 1,000 people | Automating a channel with 53 followers saves minutes on posts nobody sees |

## Keep

- The hook, story and five-band slide rules (22 Nov). They are right; they
  were applied to the wrong content in the wrong place.
- The CV upload as the only destination, one tagged link per post.
- The 24-hour gap per channel.
- The newsletter itself, as the search page and the proof. It stops being
  the thing posts sell.

## The new system

1. **Fresh or nothing.** Every number in a post is read from the database in
   the 7 days before it goes out, and the post says "verified live, week of
   …". The carousel builder refuses a spec whose read date is older than 7
   days. A post no longer has to come from a newsletter issue; its source is a
   saved query result with its date.
2. **LinkedIn goes out from Shivam's profile**, in his voice, first person,
   three times a week. The page reshares. The Pune post is the template: one
   surprising number about where the jobs are, then what it means for the
   reader. The link goes in the first comment, to the upload.
3. **Instagram posts what people send to a friend.** Two formats to test:
   - *Verified open this week:* 5 named roles at named employers, verified
     live on their own pages this week, with the skill each asks for most.
     Last slide: upload your CV to see which you fit. Our edge over job lists
     is "verified live today"; nobody else can say it.
   - *One question, one number:* a 20–30 second reel with Shivam on camera
     answering one job-seeker question with this week's number.
4. **Every post asks for the upload.** A tagged link per post
   (`utm_campaign=<post>`), so each post's signups are counted.
5. **Measured weekly.** Per post: impressions, sends/saves, comments, link
   clicks, signups. A format that does not beat the last one in two weeks is
   dropped.

## Next two weeks

| Week | LinkedIn (Shivam's profile) | Instagram |
|---|---|---|
| 23–29 Nov | 3 posts from this week's data: risk roles (025's angle, re-read), tech-risk for engineers (026's angle, re-read), one "verified open this week" list | 2 "verified open this week" carousels, 1 reel if Shivam records it |
| 30 Nov–6 Dec | Keep what beat 1,000 impressions, drop the rest | Keep the format with more sends per reach |

Success at the end of two weeks: one LinkedIn post over 2,000 impressions,
one Instagram post reaching beyond our 53 followers, and the first signup
tagged to a post.

## Decisions (Shivam, 2026-11-22)

1. **LinkedIn stays on the company page**, renamed Myro Career Intelligence
   the same day. Shivam is employed elsewhere and keeps his profile to one or
   two posts a week, as the newsletter's voice, pointing people to the page.
   The page still needs followers: its 50 monthly invite credits and those
   profile posts are how it gets them.
2. **No re-reads.** 021, 023 and 025 go out with every date removed from
   slides, captions and LinkedIn copy (done 22 Nov); trends hold over a month
   or a quarter. New posts use this week's data. The 7-day builder check in
   "The new system" is not built.
3. **Yes to a reel a week**, recorded by Shivam, plus demo videos of Myro for
   YouTube, LinkedIn and Instagram showing what to do on Myro and how it helps.
4. **Bio link to the upload: yes.** instagram.com says links are editable only
   in the app, so Shivam changes it there.
