# Instagram — @myrojobs

Set 2026-10-23, corrected 2026-11-02: the account is
[@myrojobs](https://www.instagram.com/myrojobs/). @himyro is a different, empty
private account. Shivam posts; agents write copy and never post. The weekly slots
are in [MARKETING_SCHEDULE.md](MARKETING_SCHEDULE.md); caption rules are in
brand-guidelines `surfaces/instagram.md`.

## The profile

Seen 2026-11-02 on the public page: public, the Myro ring as the photo, 53
followers. Three fields still describe an older Myro.

| Field | Today | Change to |
|---|---|---|
| Name | HiMyro Career Intelligence | `Myro · CV for the job you want` (30 of 30 characters; Instagram search reads this field) |
| Bio | An AI-based Career Intelligence Service that tracks jobs from top MNC websites for you | The block below (130 of 150 characters) |
| Links | Three: himyro.com/newsletter with no UTM, titled "Offical web page of Himyro"; myrojobs.com, which redirects to himyro.com; the LinkedIn page | One, fixed: `https://www.himyro.com/?utm_source=instagram&utm_medium=social&utm_campaign=ig-bio`, titled `Upload your CV`. It never changes once set. Set 2026-11-02 to the newsletter; moved to the upload on 2026-11-22 (Shivam), in the app |

```
Pick the job you want. Myro tailors your CV to it.
You apply on the company's own page.
Weekly: what India's MNC openings ask for.
```

## LinkedIn company page

Agreed 2026-11-02. Shivam changes it; the page name stays. Today's text still
says "Career Intelligence Platform" and leads with CV scoring.

| Field | Change to |
|---|---|
| Tagline | Pick the job you want. Myro tailors your CV to it. You apply on the company's own page. |
| Industry | Software Development |
| Type | Privately Held |
| Cover image | `frontend/public/brand/linkedin-cover.png` (2256×382, twice LinkedIn's 1128×191). The text starts 40% in, clear of the logo. |

About:

```
Myro is a CV-building machine for applying to the jobs you want.

Upload your CV and pick a job: paste it, save it with the Chrome extension, or choose from the list Myro reads from 260+ MNC career pages. Myro tailors your CV to that one job. You download it and apply on the company's own page, yourself. Then you prepare until the call comes.

Every week we publish what India's MNC openings ask for, read from the employers' own career pages.
```

## Posted so far

Newest first. The top six are marked done in the Distribution Tracker with their
live links and captions as posted.

| Date | Post |
|---|---|
| 22 Nov, 05:00 | [Issue 026 carousel, reposted](https://www.instagram.com/myrojobs/p/DgBaSReEtrV/) with the hook cover, five bands and two type sizes, posted by Claude in Chrome as @myrojobs, hashtags as the first comment, not shared to Facebook. Same morning on the LinkedIn company page: [issue 026 as a document](https://www.linkedin.com/feed/update/urn:li:ugcPost:7530051124012449792/), the first one LinkedIn offers to boost, with the link in the first comment |
| 21 Nov | [Issue 026 carousel](https://www.instagram.com/myrojobs/p/DgAw1OqIwA-/), first version, no hook on the cover. To be archived in the app (instagram.com offers only Delete) |
| 18 Nov, 02:15 | [Issue 024 carousel](https://www.instagram.com/myrojobs/p/Df20WH9EkmA/), posted by Claude in Chrome, one caption, not shared to Facebook. Same night on the LinkedIn company page: [issue 024](https://www.linkedin.com/feed/update/urn:li:activity:7528558060508762112/), with the link in the first comment |
| 3 Nov | [Issue 025 carousel](https://www.instagram.com/myrojobs/p/DfSXQmFo_NL/), from the laptop in Chrome, one caption |
| 23 Oct | [Loop reel](https://www.instagram.com/myrojobs/reel/De2Grhax5BJ/) |
| 25 Sep | [Issue 022 carousel](https://www.instagram.com/myrojobs/p/DdtOUlPI5Bn/) |
| 17 Sep | [Issue 020 carousel](https://www.instagram.com/myrojobs/p/DdYjws7kf86/) |
| 1 Sep and earlier | Nine more back to 20 Jul in the logged-out view, which stops at 12 posts; not matched to issues |

## Publishing, from the laptop

Open the post's row in [/admin/growth](https://www.himyro.com/admin/growth) and use
**Publish to Instagram**. Pick every PNG in the post's slide folder; the panel
sorts them `slide-01` first and turns them into JPEGs. Check the caption and the
first comment, press Publish, then confirm. The row reads queued, then published
with its live link, or failed with Meta's reason and a fresh try.

Until @myrojobs is connected, post the same carousel at instagram.com in Chrome:
Create → Post → add the slides in order → set the crop to 4:5 (it opens at 1:1,
which cuts the slide's top and bottom) → keep Original → paste
`caption-laptop.txt` from the slide folder → Share. Share to Facebook is on by
default for this account. Then add the hashtags as the first comment. Issue 25
went out this way on 2026-11-03.

Bio links change only in the Instagram app. instagram.com's Edit profile says so
and shows the field read-only (checked 2026-11-03). That is why the bio holds one
fixed link, to the CV upload on the home page: every post's last slide sends
people there.

Instagram's publishing API takes one caption per carousel, so the panel folds the
per-slide captions into one, in slide order (issue 25: 1,650 of 2,200 characters).
The last slide names himyro.com, so nothing depends on the caption. Multiple
Captions stays an app-only option.

The panel appears once the backend holds the account's token. A second press
cannot post twice: the row is claimed before anything is sent, and the media id
Instagram returns is saved before the post is marked live.

### Connecting @myrojobs (Shivam, once; again every 60 days)

On the laptop, signed in to the Facebook account that can manage @myrojobs:

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → Create
   App → use case Other → type Business → name it, e.g. "Myro publisher".
2. In the app, find Instagram and press Set up. Open API setup with
   Instagram business login.
3. Add @myrojobs (it must be a professional account, and public), then sign in to
   Instagram when asked.
4. Press **Generate token** next to @myrojobs and copy the token. It lasts 60 days.
   The app needs `instagram_business_basic`, `instagram_business_content_publish`
   and, for the first comment, `instagram_business_manage_comments`.
5. Paste it into your browser, after the
   question mark: `https://graph.instagram.com/v26.0/me?fields=user_id,username&access_token=`.
   The `user_id` it shows is the account id.
6. In Railway, on the prod backend service, set `INSTAGRAM_ACCESS_TOKEN` and
   `INSTAGRAM_USER_ID`. himyro.com's tracker talks to prod, which builds from
   `main`, so the panel appears there after the next `main` merge.

Meta's page says App Review is needed for "live data". If Publish fails with a
permissions error, that is the step left, and the row will say so.

## Next

Each carousel below is published from the laptop as above. Hashtags go in the
first comment. **Before 023 goes, Shivam moves the bio link to the upload** (the
Links row above, in the app): until then "Link in bio" still opens the newsletter.

One post a day on each channel until the backlog clears (Shivam, 2026-11-17),
and never within 24 hours of that channel's last post (Shivam, 2026-11-22).
The tracker rows carry these dates. Issue 024 went out on both channels at 02:15
on 18 Nov (Shivam chose now over the slots).

| Day | LinkedIn, 10:30 | Instagram, 19:00 | Before it goes |
|---|---|---|---|
| Wed 18 Nov | Issue 024, posted | Issue 024 carousel, posted | |
| Thu 19 Nov | Fill video, 10:00 | Issue 026 carousel, posted 21 Nov, reposted 22 Nov with the hook cover | Video: someone listens to the soundtrack. 026's page is live (checked 18 Nov after the `main` merge, #352) |
| Fri 20 Nov | Issue 026, as the document `issue-026-linkedin.pdf`, posted 22 Nov | Issue 023 carousel, rebuilt as a story 19 Nov, hook cover 22 Nov | 023 names only AB InBev, Palo Alto Networks and Barclays, the three rates the live Ghost Index still shows (read 19 Nov) |
| Sat 21 Nov | Issue 021, as the document `issue-021-linkedin.pdf` | Fill reel, 10:00 | |
| Sun 22 Nov | Issue 025, as the document `issue-025-linkedin.pdf`, rebuilt as a story 22 Nov | Issue 021 carousel, rebuilt as a story 19 Nov, hook cover 22 Nov | |
| Mon 23 Nov | Match video | Match reel | Soundtrack heard |

Issue N's copy lives in `scripts/newsletter-carousel-specs/issue-0NN-distribution.md`:
the `## LinkedIn` section, and the Instagram caption in `caption-laptop.txt`
beside its slides in `Myro Newsletter/Issue 0NN - carousel/`. On LinkedIn the
slides go up as one document, `issue-0NN-linkedin.pdf` from the same folder, and
the link goes in the first comment, with `utm_campaign=issue-0NN`. The fill video is
`brag-output-2026-10-20-155052/` and the match video `brag-output-2026-10-20-134012/`,
each with its own `linkedin.txt` and `instagram.txt`. On LinkedIn, 022 and 023 are
paused because they repeat the 25 Sep Ghost Index post.

After 23 Nov, a new issue takes the next Tuesday (LinkedIn) and Wednesday
(Instagram).

The kits, issue 021's kit, reels through Publish and a dead-token alarm are
Cursor's: [ARCHITECTURE_BRAND_DISTRIBUTION.md](ARCHITECTURE_BRAND_DISTRIBUTION.md) (#64).

## Before each post

- **Reels:** someone listens to the soundtrack first (MARKETING_SCHEDULE gate).
- **Carousel length:** these run 7 and 8 slides. The brand guide's carousel line
  says 6. Instagram takes up to 20.
