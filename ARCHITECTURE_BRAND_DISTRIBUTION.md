# Brand distribution: the weekly posts, built once

**Architecture spec #64. Implementation by Cursor. Written 2026-11-15 by Claude
from the live @myrojobs grid, prod reads and a code walk.** Claude keeps the
thinking and the orchestration: it verifies every chunk, and it posts with
Shivam until the publisher is connected. Cursor builds.

> **VERIFY IN CODE before building.** Line numbers are from `afb222d7`. One chunk
> = one commit on `Develop`, six gates green, `git add` only your own files.
> Migrations are applied before the code that reads them, then
> `NOTIFY pgrst, 'reload schema';`. Cursor never posts, comments or edits a
> profile on any network, and never sets a Railway variable.

---

## 1 · What is true, read 2026-11-15

- **@myrojobs** is the account (53 followers). Last post: issue 025, 3 Nov,
  published by Claude in Shivam's Chrome. Nothing since. The fill reel (7 Nov),
  issue 024 (11 Nov) and the match reel (14 Nov) were not posted.
- **The profile still says the old Myro**: name, bio and three links unchanged.
  The agreed text is in [INSTAGRAM_PROFILE.md](INSTAGRAM_PROFILE.md). Links can be
  edited only in the phone app.
- **Publish to Instagram** (`ba1197dd`) is on `main` and has never run: the
  `growth-media` bucket holds 0 files. The Meta app and token are not set up. It
  posts carousels only. Reels need the phone or Chrome.
- **Each issue kit is hand-run scripts and SQL**: per-slide captions,
  `captions.txt`, `caption-laptop.txt`, the kit section, the tracker rows. Each new
  issue repeats them.
- **Issue 021** has a LinkedIn row planned for 24 Nov, no Instagram caption and an
  empty slide folder.
- **No LinkedIn row planned from 15 Oct on is marked posted**, the loop video's
  included, so the tracker cannot say what went out there.
- The site footer already links @myrojobs (`public-footer.tsx:23`). Nothing to build.

---

## 2 · Owners you reuse, never re-create

| Question | The one owner | Do not |
|---|---|---|
| Rendering slides and the OG card | `scripts/build-newsletter-carousel.py` | a second renderer, hand-made PNGs |
| A slide's caption, the first comment | the issue's spec, `scripts/newsletter-carousel-specs/issue-NNN.json` (after B1) | captions typed into kits or tracker rows by hand |
| Folding per-slide captions into one | the builder writes it (B1); `frontend/lib/growth/instagram.ts` `singleCaptionFrom` must produce the same text, held by a test | a third fold |
| Tracker rows | `growth_*` through `GrowthRepository` (`repositories/growth.py`), keys `asset:issue:<slug>`, `campaign:issue:<slug>`, `message:issue:<slug>:<channel>` | raw SQL, new tables, new key shapes |
| Instagram API calls | `InstagramClient` in `services/instagram_publisher.py` | a second client, a token in a POST's URL |
| One publish, never two | `claim_for_instagram` + `metadata.instagram_media_id` + unique `(message_id, external_id)` | another lock or flag |
| The bio link | fixed, `…/newsletter?utm_source=instagram&utm_medium=social&utm_campaign=ig-bio` ([MARKETING_SCHEDULE.md](MARKETING_SCHEDULE.md)) | a per-post bio link |
| When things go out | MARKETING_SCHEDULE.md and the rows' `planned_at` | dates in code |
| Telling Shivam something broke | the Notice board belts: `notice/harvest.py`, `notice/fingerprint.py` `_BELTS` | an email, cron or alert of its own |

Out of scope, leave alone: posting, profile text, the LinkedIn and X APIs, X (off
the schedule since 2026-11-02), the brand-token refactor (#17), newsletter
content, issue 26 (held), the per-slide Multiple Captions (app-only; the API takes
one caption).

---

## 3 · The chunks

Three lanes. Lanes do not share files, and none touches a #62 lane's files.

| Lane | Chunks | Files it owns |
|---|---|---|
| A · kits | B1 → B2 → B6 (B6 also takes lane C's two files) | `scripts/build-newsletter-carousel.py`, `scripts/newsletter-carousel-specs/*`, `backend/tests/test_carousel_kit.py`, `frontend/tests/growth-instagram.test.ts`, the gitignored `Myro Newsletter/Issue NNN - carousel/` outputs |
| B · publisher | B4 → B5, and B7 in either order (B7 adds `services/probe.py`, a new `services/posting_health.py` and their tests) | `services/instagram_publisher.py`, `routers/growth.py`, `repositories/growth.py`, `schemas/growth.py`, `components/growth/*`, `lib/growth/instagram.ts`, the growth section of `lib/api.ts`, `notice/harvest.py`, `notice/fingerprint.py`, `notice/closer.py`, one migration, their tests |
| C · tracker sync | B3 | `backend/scripts/growth_kit_sync.py`, `backend/tests/test_growth_kit_sync.py` |

B3 reads the fields B1 adds, so lane C starts after B1. B4 and #62 R6 both edit
`lib/api.ts`, in different sections. Rebase before you commit.

### B1 · One spec, one command, the whole kit

**Why.** Issue 025's kit took hand-run scripts for the captions, the two caption
files, the kit section and the figure check (2026-11-02). Every new issue repeats
them, and a caption edit meant a full re-render.

**Do.**
- The spec gains `"article": "<slug>"` (the file in
  `frontend/content/newsletter/issues/`), `"first_comment": "#a #b #c"`, and
  `"caption"` on every slide. `"link"` on a slide already renders
  (`build-newsletter-carousel.py`, `link_html`).
- After rendering, the builder writes three text outputs:
  1. `captions.txt` in the spec's `out` folder: `SLIDE n` blocks, then
     `FIRST COMMENT`, then `BIO LINK (fixed, never changes)` with the fixed link.
     Today's `Myro Newsletter/Issue 025 - carousel/captions.txt` is the reference
     shape.
  2. `caption-laptop.txt` beside it: the captions folded into one (labels gone,
     sections joined by one blank line, slide order), then the same two blocks
     after a `---` line. Today's 025 file is the reference.
  3. The `## Instagram captions, one per slide` section of
     `issue-NNN-distribution.md`, rewritten from the heading to the next `## ` or
     the end: the two-paragraph intro it has today, `Slide n:` blocks,
     `First comment:`, then a new `### One caption, for the laptop` block holding
     the folded text.
- **Figure check.** Every number in every caption (`\d[\d,]*\.?\d*%?`, trailing
  `.` or `,` stripped) must appear in the article file. A miss fails the run and
  names the slide and the figure. The folded caption must be at most 2,200
  characters; the first comment holds 3 to 5 hashtags.
- `--captions-only` skips Playwright and writes the three text outputs.
  `--no-og` renders slides without touching the tracked OG image.
- Move the captions of issues 023, 024 and 025 out of their kits into their specs,
  then run `--captions-only`. Each kit section must come out byte-identical to
  today's, plus the new laptop block.

**Do not.** Change how a slide renders. Re-render issues 023 to 025 without
`--no-og`. Keep captions anywhere but the spec.

**Tests.** `backend/tests/test_carousel_kit.py` (load the hyphenated script with
`importlib.util`): the three outputs for a two-slide fixture; a figure missing
from the article fails with its slide number; over 2,200 fails; two or six
hashtags fail. Extend `frontend/tests/growth-instagram.test.ts`: for each of the
023, 024 and 025 kits, `singleCaptionFrom` of the `Slide n:` blocks equals the
`### One caption, for the laptop` block. One fold, two languages, one answer.

**Done when.** `python3 scripts/build-newsletter-carousel.py
scripts/newsletter-carousel-specs/issue-025.json --captions-only` leaves
`git diff` on the 025 kit showing only the laptop block, and both caption files
match today's byte for byte. Paste the `cmp` output.

### B2 · Issue 021's kit

**Why.** Issue 021 (finance city map, published 2026-09-17) is the only shipped
issue with a LinkedIn row and no Instagram kit. Its slide folder is empty.

**Do.** In `issue-021.json`: `"link": "Full issue: himyro.com/newsletter"` on the
first and last slide; `"article": "2026-09-finance-city-map-india"`;
`first_comment` (`#jobsearch` + one niche + `#himyro`); a `caption` per slide cut
from the article section that slide shows, in the article's own sentences. The
last caption ends `Tailor your CV to jobs like these. Link in bio.` Run the
builder with `--no-og`.

**Do not.** Write a claim the article does not make. Edit the article. Post.

**Tests.** B1's figure check passes. Both lints pass on the kit:
`node ~/.claude/skills/write-like-human/scripts/ai-tells-lint.mjs` and
`bash "Myro Newsletter/brand-guidelines.skill/validator/lint-vocab.sh"`.

**Done when.** The 021 folder holds the PNGs, `captions.txt` and
`caption-laptop.txt`, and the kit has its section. Claude reads the captions for
voice before anything is posted.

### B3 · Kit to tracker, one command

**Why.** The Instagram rows were filled by hand-written SQL on 2026-11-02 and
2026-11-03, and their copy drifted from the kits twice.

**Do.** `backend/scripts/growth_kit_sync.py <spec.json> [--dry-run]`, run with
`backend/.venv` and `PYTHONPATH=backend`:
- Read the spec (B1's fields) and the kit's `## LinkedIn` section.
- Upsert by legacy key, through `GrowthRepository` as it is: the asset
  (`kind newsletter`, `canonical_url`, `status published`), the campaign (slug
  `<slug>-launch`), and two messages, `instagram`/`carousel` and
  `linkedin`/`carousel`. Copy the shapes from the issue 025 rows.
- Instagram `draft_copy` is the `Slide n:` blocks, as the 024 row holds today.
  `metadata`: `prepared_draft`, `first_comment`, the fixed `bio_link`, the kit
  path, and `how_to_post` in the 024 row's laptop wording. `utm_url` is
  `https://www.himyro.com/newsletter/<slug>?utm_source=<channel>&utm_medium=social&utm_campaign=issue-NNN`.
- Creating a row sets its `format` and leaves `planned_at` empty: Claude dates
  it. An existing row keeps its `format` and `planned_at`; issue 021's LinkedIn
  row is a `post`, and it stays one. On a row that exists the command writes only
  `draft_copy`, `metadata` and `utm_url`.
- Skip a message whose status is `published` or `queued`, and print that it did.
- `--dry-run` prints each field that would change.

**Do not.** Edit `repositories/growth.py` (lane B owns it). Write any other table.
Touch a published row.

**Tests.** `backend/tests/test_growth_kit_sync.py` with a fake repository: a
published row is untouched; a new issue creates the asset, the campaign and both
messages under the right keys; the bio link is the fixed one; running twice
changes nothing.

**Done when.** A dry run on 025 prints "skipped (published)" for Instagram. A dry
run on 024 prints no Instagram change, which proves parity with today's row. A
real run on 021 creates its Instagram row; read it back in SQL and paste it.

### B4 · Reels through Publish to Instagram

**Why.** Half the weekly Instagram slots are reels (Saturdays). The publisher
takes only carousels: `claim_for_instagram` filters `format = carousel`, and the
route takes `slides`.

**Do.**
- Migration: `growth-media` also allows `video/mp4`, and the file limit rises to
  50 MB (the three reels are 5.7 to 7.5 MB).
- `InstagramClient.create_reel(video_url, caption)`: `POST /<IG_ID>/media` with
  `media_type=REELS`, `video_url`, `caption`, `share_to_feed=true`, then the same
  `wait_until_finished`. Video can take minutes. Keep the five-minute deadline,
  and read Meta's current guidance on poll spacing before you pick an interval.
- `run_publish` takes the kind and keeps one path: media id saved before the post
  is marked live, permalink read after.
- `claim_for_instagram` takes the format and claims `carousel` or `reel`.
- The route takes either 2 to 20 JPEG `slides` or exactly one `video` (MP4: bytes
  4 to 8 read `ftyp`), never both.
- The panel shows for `format` `carousel` or `reel`. A reel row picks one MP4, sends
  it without re-encoding, and uses the row's caption as it is.
- Check the three `brag.mp4` files against Meta's Reels requirements (container,
  codecs, 9:16, length) on
  `developers.facebook.com/docs/instagram-platform/content-publishing`, and write
  what you found in the commit message.

**Do not.** Re-encode video in the browser. Add a second claim, client or bucket.

**Tests.** Client: the reel's container, wait, publish and permalink against a
fake Meta. Route: one MP4 is accepted, a JPEG as `video` is refused, slides plus
video are refused. Panel: a reel row renders the video picker and the caption.

**Done when.** Tests and gates pass. The first live reel is **BLOCKED** until
Shivam connects Meta (section 4).

### B5 · A dead token opens a Notice

**Why.** The dashboard token lasts 60 days. When it lapses, Publish fails at the
moment Shivam presses it.

**Do.**
- `instagram_publisher.token_state() -> BeltState | None`: `None` when no token is
  set or Instagram cannot be reached; `"ok"` when `GET /me?fields=user_id`
  answers; `"stalled"` when Meta refuses the token.
- `closer.py`: pass it to `harvest_belts` as `instagram_state`.
- `harvest.py`: open `Sighting.dead_man(belt="instagram_publish")` on
  `"stalled"`, close it with a `CloseProof` on `"ok"`, the same pattern as the
  verifier block.
- `fingerprint.py`: add `instagram_publish` to `_BELTS`.

**Do not.** Refresh or store the token. It lives in Railway, and replacing it is
Shivam's, every 60 days, with the steps in INSTAGRAM_PROFILE.md.

**Tests.** Harvest: the three states open, close or do nothing. The fingerprint
allowlist includes the belt. With no token set, the closer behaves as today.

**Done when.** Tests and gates pass.

### B6 · Slides a phone can read, one caption per post

**Why.** The point of this spec is posting on schedule (Shivam, 2026-11-16), so
this chunk never holds a slot. A phone shows a 1080px slide at about a third of
its width. At that scale the headlines (78px) read. The 37px grey sub comes out
near 12pt, the 21px capitals footer near 7pt, and a six-column heatmap is a
texture. Every kit from 021 to 026 puts the method in grey under the cover
headline, and every caption is all the slides' text folded into one (issue 025
went out at about 1,650 characters). Carousels that get swiped carry one idea per
slide and put the claim in the caption's first two lines. The article stays on
the site. The slide is the post.

The rules:
1. One idea on a slide.
2. Nothing under 28px. Body copy at 40px or more, in the off-white.
3. The cover is its headline alone.

**Do.** In `scripts/build-newsletter-carousel.py`:
- **Type.** In `css()`: no `font-size` under 28px (`.rail`, `th`, `.cliff .lbl`,
  `.card .t` and `.mtx th` go to 28px). `.sub`, `.note`, `td`, `.mtx td`,
  `.card .d` and `.golink` at 40px or more, in `var(--fg)`. `--muted` stays on
  `.rail` only. The OG card's inline 1200×630 sizes in `main()` are out of scope.
- **The footer goes.** Delete `.foot`, the spec's `"foot"` and the per-slide
  override. A spec that still has `"foot"` fails. The lane size and the read date
  belong in the caption.
- **Checks before Playwright**, like the figure check, each naming its slide.
  Words are counted with tags stripped. A `.` inside a number such as `1.0` does
  not end a sentence.
  - Slide 1 is a `statement` with no `sub` and an `h1` of at most 17 words (issue
    025's cover is 17, the longest that reads).
  - Any other `h1`: at most 17 words. Every `sub` and `note`: one sentence of at
    most 12 words.
  - `matrix`: at most 2 value columns and 6 rows. `table`: at most 5 rows.
    `cards`: at most 3, each `d` at most 12 words. `prose`: at most 25 words.
- **One caption per post.** The spec has one top-level `"caption"`, and a slide
  that has its own `"caption"` fails. The first paragraph, up to the first blank
  line, is the claim: at most 125 characters, which is what Instagram shows
  before "more". The whole caption is at most 500 characters and ends
  `Tailor your CV to jobs like these. Link in bio.` The figure check runs on it.
- **Outputs.** `caption.txt` (the caption, then the FIRST COMMENT and BIO LINK
  blocks as today) replaces `captions.txt` and `caption-laptop.txt`. The kit's
  `## Instagram captions, one per slide` section becomes `## Instagram caption`:
  the caption, then `First comment:`. Delete `fold_captions` and the per-slide
  writers in the same commit.
- **`backend/scripts/growth_kit_sync.py`** (lane C's file, taken by this chunk):
  `instagram_draft` returns the spec's `caption`, the how-to names `caption.txt`,
  and the missing-caption check reads the top-level field.
- **Recut the kits whose Instagram post is not out**, in slot order: 024, 026,
  023, 021. Before each one, read its Instagram row in `growth_messages`. A row
  that is `published` or `queued` means that kit stays exactly as it is (the same
  rule as B3's `SKIP_STATUSES`). Recutting removes words and never adds a claim.
  A cut `sub` was a second idea: it moves into the caption, or it stays only in
  the article. Render with `--no-og`, then run B3's command on the spec so the
  unposted row carries the new caption.

**Do not.** Hold a slot for this chunk: if a kit's slot comes before the recut
lands, it posts as it is. Touch a posted kit (025 and earlier, or any row that is
`published` or `queued`). Their specs are history and are never run again, so
they need not pass the new checks. Touch the OG card or `lib/growth/instagram.ts`.
`singleCaptionFrom` already returns a single caption unchanged, and its test says
so. Write a figure the article does not have.

**Tests.** Write these first.
- `backend/tests/test_carousel_kit.py`:
  - The slide CSS has no `font-size` under 28px, and the body classes are 40px
    or more in `var(--fg)`.
  - Each of these fails and names its slide: a cover with a `sub`; an 18-word
    headline; a `sub` with two sentences or 13 words; a three-column `matrix`; a
    `"foot"`; a per-slide `"caption"`; a first paragraph over 125 characters; a
    caption over 500; a caption without the closing line.
  - The two-slide fixture writes `caption.txt` and the kit section.
- `backend/tests/test_growth_kit_sync.py`: the Instagram draft is the spec's
  caption.
- `frontend/tests/growth-instagram.test.ts`: replace "the laptop block is the same
  fold". For each kit this chunk recut, its `## Instagram caption` comes back
  unchanged from `singleCaptionFrom` and is at most 500 characters. Issue 25's
  test stays as it is: that kit is posted and does not change.

**Done when.** Gates pass. For each recut kit: the PNGs, `caption.txt`, the kit
section, and the tracker row's new caption. Claude looks at every recut slide at
360px wide and reads each caption for voice before it posts.

### B7 · A missed posting slot opens a Notice

**Why.** Posting on schedule is the point of this spec. From 3 to 16 November
nothing went out on Instagram and nothing said so. On 17 November, 10 LinkedIn
rows were past their slot with no post recorded. The oldest was planned for 27
May, and none since June is marked posted. Two things stop the rhythm: a slot
passes with no post, or the coming week has too little planned. The tracker
already holds both facts. The daily Notice closer reads neither.

**Do.**
- `services/probe.py`: `POSTING_CHANNELS = ("instagram", "linkedin")`. A
  `POSTING` dict of declarations, two per channel, both opening on `"stalled"`:
  `posting.{channel}.missed` and `posting.{channel}.under_floor`. Each is its own
  belt, the same as `SNAPSHOTS`, so the digest names the channel and the reason,
  and a recovery on one never closes another.
- New `services/posting_health.py`. It reads and writes nothing else.
  - A pure `posting_states(rows, now) -> dict[str, BeltState]` over
    `growth_messages` rows (`channel`, `status`, `planned_at`).
  - **missed:** a row whose `status` is `ready_for_review`, `approved`, `queued`
    or `failed`, with `planned_at` at least 12 hours before `now`. `mark_published`
    sets a posted row to `published`, so a post that went out and was marked never
    counts. A failed post is a missed slot.
  - **under_floor:** fewer than 2 rows with `planned_at` in the next 7 days and a
    `status` of `ready_for_review`, `approved`, `queued` or `published`. `draft`
    and `paused` rows are not planned posts. The 2 is the weekly floor in
    MARKETING_SCHEDULE.md. Name it once, with a comment pointing there.
  - Each belt is `"stalled"` when its condition holds and `"ok"` when it does not.
  - `check_posting()` makes one read: rows where `archived_at` is null,
    `channel` is in `POSTING_CHANNELS` and `planned_at` is not null. It returns
    `posting_states` of those rows.
  - **Why 12 hours.** The closer runs at 02:30 UTC (08:00 IST). Slots are 10:00,
    10:30 and 19:00 IST, so 12 hours puts every missed slot in the next
    morning's digest. At 24 hours, Wednesday's 19:00 carousel would wait until
    Friday.
- `notice/harvest.py`: `harvest_belts(..., posting_states=...)`. Lift the snapshot
  loop into one helper that takes the declarations and the states, and call it for
  both. `"stalled"` opens `Sighting.dead_man(belt=...)`. `"ok"` closes with a
  proof keyed `harvest:{belt}_held`. A belt the declarations do not name is never
  closed.
- `notice/closer.py`: in `harvest_into`, one more block in the same pattern as the
  snapshot block: `posting_health.check_posting()`, failure logged as
  `metric notice.harvest_posting_failed`, state left `None` (no open, no close).
- `notice/fingerprint.py`: add the `POSTING` belts to `_BELTS`, as `SNAPSHOTS` does.

**Do not.**
- Add a table, a column, a cron, an email or a `Sighting` field. The digest is the
  alert and `/admin/growth` is where it gets fixed.
- Write to any growth row. Marking posted, pausing and re-planning stay human
  (section 4).
- Count X, email or any other channel. X is off the schedule.
- Cap how far back a missed slot counts. A missed slot stays missed until someone
  records what happened to it.

**Tests.** Write these first.
- `backend/tests/test_posting_health.py`, with fixed rows and a fixed `now`:
  - A slot 13 hours past is missed. One 11 hours past is not.
  - A `published` row never counts, and a `failed` one does.
  - With 1 planned row in the next 7 days the channel is under the floor; with 2
    it is ok. A `draft` row does not count toward the floor.
  - Instagram stalled and LinkedIn ok stay apart.
- `backend/tests/test_notice_harvest.py`: a stalled posting belt opens its own
  `dead_man`. An ok one closes only its own. An undeclared belt is never closed.
  The snapshot cases still pass through the shared helper.
- The fingerprint allowlist includes all four belts. When `check_posting` raises,
  the closer behaves as it does today.

**Done when.** Tests and gates pass. Run `check_posting()` against production once
from the laptop and paste the four states. The tracker backlog was settled on
17 Nov (section 4), so the first digest names only slots missed after that.

---

## 4 · Not Cursor's

**Shivam, with his login:**
1. Instagram app: the name, the bio and the one fixed link (INSTAGRAM_PROFILE.md).
2. LinkedIn: tagline, About, industry, type and the cover image.
3. Meta app, token, and the two Railway variables on prod: six steps in
   INSTAGRAM_PROFILE.md. Then a `main` merge carries B4 and B5.
4. Listen to the fill and match reels' soundtracks before they go out.

**Claude:**
- Verifies each chunk: reads the diff against section 2 and the chunk's "Do not",
  reruns the gates, reads the proof, then writes "Verified {sha}" in section 5 or
  sends Cursor one fix prompt.
- Readies each day's posts from the queue in INSTAGRAM_PROFILE.md (Next) until
  the publisher is connected: one a day on each channel until 23 Nov (Shivam,
  2026-11-17). Shivam posts them (MARKETING_SCHEDULE.md).
- Reads the LinkedIn page with Shivam and marks in the tracker what went out.
- **Settles every slot that passes**: Mark posted in `/admin/growth` with the live
  URL, `paused` if it will never go out, or re-planned to a real date. Done for
  the backlog on 17 Nov, read against the live company page and Shivam's profile:
  - Issue 020 and the loop video were posted (17 Sep and 23 Oct, both on the
    company page) and are now marked posted.
  - The May and June rows, issue 022 and issue 023 are `paused`. 022 and 023
    repeat figures the 25 Sep Ghost Index post already made.
  - Issue 025 moved to 1 Dec and 021 to 8 Dec (newest first). The fill and match
    videos moved to Thu 19 and 26 Nov.
  - Nothing has gone out on LinkedIn since 23 Oct.

---

## 5 · Status

Cursor builds, Claude verifies. Cursor writes "Built {date}"; only the verify
pass writes "Verified".

| Chunk | State |
|---|---|
| B1 | Built 2026-11-15. |
| B2 | Built 2026-11-15. |
| B3 | Built 2026-11-15. |
| B4 | Spec only. Live post BLOCKED on Shivam's Meta setup. |
| B5 | Spec only. |
| B6 | Spec only (2026-11-17). Never holds a slot. |
| B7 | Spec only (2026-11-17). Tracker backlog settled 2026-11-17 (section 4). |
| Footer link to @myrojobs | Not needed: already in `public-footer.tsx` (checked 2026-11-15). |

---

## 6 · Handing a chunk to Cursor

One prompt. Change the chunk id and paste it into a fresh Cursor chat. One chunk
per chat.

```text
Read CLAUDE.md, then ARCHITECTURE_BRAND_DISTRIBUTION.md in full. Build chunk B1 only.

1. Before any edit, open every file the chunk cites and check it still says what
   the spec says. If it does not, stop and tell me what you found.
2. Section 2 names the one owner of each answer. Reuse it. Add nothing the chunk
   does not name: no new renderer, client, claim, bucket, table, key shape, cron
   or alert.
3. Touch only the files your lane owns (section 3), the tests the chunk names, and
   BACKLOG.md for the #64 row. If you need any other file, stop and ask.
4. Write the chunk's tests first and watch them fail. Then write the code.
5. Never post, comment or edit a profile on Instagram, LinkedIn or X. Never set a
   Railway variable. Anything marked BLOCKED stays switched off.
6. A migration is applied before the code that reads it, then
   NOTIFY pgrst, 'reload schema'. If you cannot apply it, stop there and say so.
7. Run all six gates from CLAUDE.md. Paste the last lines of each.
8. git add only the files you changed, never -A or a dot. One commit on Develop,
   then push. Never touch main.
9. In that commit, set the chunk's row in section 5 to "Built {today}", and write
   the same on the #64 row in BACKLOG.md.
10. Reply with the files changed, the gate output, and the proof the chunk asks
    for under "Done when". If you could not produce it, say so. Do not write "done".
```

**Order.** B1 → B3 → B2 → B4 → B5 → B7, one chat at a time. B7 does not wait on
Shivam's Meta setup, so it may go before B4 and B5. B5 and B7 both edit
`harvest.py`, `closer.py` and `fingerprint.py`, so one of them rebases on the
other. B6 runs beside lane B: it holds lanes A and C, so no other chat may touch
those lanes while it runs. B1 first, because B2 and B3
read its fields. B3 before B2, so issue 021's row comes from the command. With
two chats at once: lane A or C in one, lane B in the other, never two in one lane.

**After each push**, Claude verifies (section 4) before the next chunk's prompt.
