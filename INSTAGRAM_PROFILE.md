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
| Links | Three: himyro.com/newsletter with no UTM, titled "Offical web page of Himyro"; myrojobs.com, which redirects to himyro.com; the LinkedIn page | One: the newest post's bio link, from its kit |

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

Newest first. The top four are marked done in the Distribution Tracker with their
live links and captions as posted.

| Date | Post |
|---|---|
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

Bio links change only in the Instagram app. instagram.com's Edit profile says so
and shows the field read-only (checked 2026-11-03).

Instagram's publishing API takes one caption per carousel, so the panel folds the
per-slide captions into one, in slide order (issue 25: 1,650 of 2,200 characters).
The slides carry the issue link on the first and last slide, so nothing depends
on the caption. Multiple Captions stays an app-only option.

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
first comment, and the bio link changes to the post's link.

| # | When (IST) | Post | Files | Copy |
|---|---|---|---|---|
| 1 | Sat 7 Nov, 10:00 | Fill reel, 22 s (was planned for 31 Oct) | `brag-output-2026-10-20-155052/brag.mp4` | Its `instagram.txt` |
| 2 | Wed 11 Nov, 19:00 | Issue 024 carousel, 7 slides | `Myro Newsletter/Issue 024 - carousel/` | `scripts/newsletter-carousel-specs/issue-024-distribution.md` |
| 3 | Sat 14 Nov, 10:00 | Match reel, 22 s | `brag-output-2026-10-20-134012/brag.mp4` | Its `instagram.txt` |
| 4 | Wed 18 Nov, 19:00 | Issue 023 carousel, 7 slides | `Myro Newsletter/Issue 023 - carousel/` | `scripts/newsletter-carousel-specs/issue-023-distribution.md` |

A new issue takes the next Wednesday ahead of this list. Issue 26 is held until
EY is back in the live set (NEWSLETTER_QUEUE). Issue 25's figures are dated
20 October, before EY dropped out on 27 October, so the hold does not touch it.

Left out: issue 021, which has no Instagram caption, no tracker row and an empty
slide folder.

## Before each post

- **Reels:** someone listens to the soundtrack first (MARKETING_SCHEDULE gate).
- **Carousel length:** these run 7 and 8 slides. The brand guide's carousel line
  says 6. Instagram takes up to 20.
