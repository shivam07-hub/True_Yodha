# The Myro newsletter standard
### Set 2026-08-26 from Issue 019. This is the default, not one issue's format.

An issue is written **slide-first**. Each section is a self-contained piece of
knowledge that stands alone on a phone screen. If a paragraph cannot survive
being screenshotted on its own, it is not finished. The carousel is written
after the issue, as a story told in its slide headlines (below), with every
figure taken from the issue.

Reference issue: `Myro Newsletter/issues/2026-08-industry-city-map-india.mdx`
Carousel: `scripts/build-newsletter-carousel.py` + a spec in
`scripts/newsletter-carousel-specs/`.

## The shape

1. **The prescriptions.** Two or three lines, one per reader type, each naming a
   place or an action. No preamble, no "we expected", no throat-clearing.
2. **Provenance.** One sentence: what our agents read, how many companies, how
   many openings, when.
3. **The matrix or chart.** One visual, and it is the thing people screenshot.
4. **One section per reader lane**, each ending in **the skills those employers
   named**. The skills are the payload, not a garnish.
5. **Methodology.** What the field actually is, what was filtered, what the
   limits are.
6. **No CTA in the body.** The template renders the one CTA after the FAQ.

## What the gold version changed (Issue 019, Shivam's edit, 2026-08-26)

My draft was accurate and read like a consultant's memo. Shivam's rewrite is the
standard. The differences, in order of how much they matter:

1. **Round the provenance, keep the findings exact.** The lede says "250+ MNC
   career pages" and "close to 15,000 openings". Every number inside the body
   stays exact to one decimal. Precision in the opening line reads as fussy;
   precision in a finding is the product.
2. **Use the word the reader uses.** "GCC", not "bank technology centre". The
   audience works in this market and the domain word costs nothing to whoever
   does not.
3. **Cut the scaffolding.** No "each row adds to 100%", no "read along your row",
   no "hold that row loosely". Explaining how to read the table is a tell that
   the table is not clear enough.
4. **One warm human aside per issue.** "the floors (and the rains!) of Mumbai".
   Not a joke, a signal that a person wrote it.
5. **Section headings can be the whole piece of advice**, in full sentences:
   "If you are in finance, then Mumbai. But if you want a job in retail banking,
   move to your favourite tier 2 city."
6. **State what a thing is.** Never "X is not Y", never "the offices are there,
   the hiring is not". Say "a Mumbai office is a satellite and a Bengaluru office
   is the engine". This is the single most persistent tell and the mechanical
   linter does not catch it.
7. **No methodology section in the prose.** Provenance lives in the `dataset`
   frontmatter, so schema.org still carries the caveats without the article
   stopping to defend itself.
8. **The CTA says what Myro does**, then links. "We track the official career
   pages of MNCs and what skills they hire for" earns the click. Decided again
   2026-10-23: `IssueCta` carries it, so one edit changes every issue.

Deliberately absent from the gold version: career-stage blocks (Early / Mid /
Senior). `myro-newsletter Skills/page-anatomy.md` calls them load-bearing. They
are not, when every section is already addressed to one reader type by name.

## Carousel: a story

Set by Shivam, 2026-11-18: "There is no story - only random numbers." Kits 020
to 026 cut the issue section by section into one number per slide. The slides
could be shuffled and nothing was lost, so nothing carried the reader to the
next swipe.

1. **The headlines come first, as one storyline.** Each slide has a `headline`
   (or the cover's `h1`): one sentence of at most 12 words. Read in order, the
   headlines tell the story with no slide open: the hook, the proof, what it
   means for the reader, what to do.
2. **Slide 1 is the hook** (Shivam, 2026-11-22: "where the hell is the hook?").
   It is the turn, told as the reader's stake, with one number on the cover
   and the question left open: which job, which city, how to tell. The reader's
   old belief alone is a setup, and a setup gives no reason to swipe. 026 went
   out with "Risk and compliance sounds like a job for accountants" and the
   292 roles in the footer; its hook is "A job that sounds like accounting is
   hiring engineers." Every later headline also leaves the question the next
   slide answers.
3. **The reader is the subject.** Write to "you" and their work, and put the
   number under the sentence it proves.
4. **Each slide answers the one before it.** If two slides can swap places, one
   of them belongs in the article.
5. **The last slide is the action:** upload your CV at himyro.com and see what
   these roles ask that it doesn't. No slide sends people to the newsletter
   (Shivam, 2026-11-22): the issue is the proof, Myro is the product.
6. **Shivam agrees the storyline before the slides are built:** the headlines in
   order, one line each, the same gate as angle, chart and heading.

Each slide's caption is that slide's line of the story, so the folded caption
reads as the story in brief. Issue 026 is the reference:
`scripts/newsletter-carousel-specs/issue-026.json`.

**LinkedIn gets the same slides as one PDF document**,
`issue-0NN-linkedin.pdf`, which the builder writes beside the PNGs. It swipes
like the carousel. A Page can boost a document post; it cannot boost a
multi-image post (LinkedIn Help, "Posts available to boost from a LinkedIn
Page", read 2026-11-18). Issue 024 went out on LinkedIn as a multi-image post.

## Carousel type: two sizes, one text colour, one font

Set by Shivam, 2026-11-22: "at max 1-2 font size, 1 color, and 1 font style.
That is standard and professional." Slides until then mixed a mono and a sans,
mint, bone and grey, and seven sizes on one screen.

| Size | What |
|---|---|
| Large, 84px | The cover's `h1`, each `headline`, the one number |
| Small, 38px | Everything else: label, sub, note, bars, table, link, foot, rail |

**Five bands, the same on every slide** (Shivam, same day). The slide is five
equal bands, 270px each. The rail sits in the first and the foot in the last.
The content starts at the top of the second band and ends inside the fourth,
so the top edge never moves from slide to slide. The builder refuses a slide
whose content runs past the fourth band: cut words or rows, never shrink the
type. Issue 021 lost two employer rows this way.

One font (Geist), one weight (500), and all text in bone. The background
stays Myro's: near-black with the mint glow in the top-right corner (Shivam,
same day: one colour means the text, not the background). No accent colour on
text, no bold, no uppercase or letter-spacing. Bars and table rules are drawn
in the same bone. Emphasis comes from size and position only, so the
sentence that matters is the large one. `css()` in
`scripts/build-newsletter-carousel.py` holds the two sizes; the OG card uses
the same rule at its own scale (41px and 22px).

## Rules that are not negotiable

- **Skills are the driver.** Every lane ends in skills a real posting named this
  month. That column is what a reader tailors a CV against.
- **We do not predict.** We report what companies are hiring for, where, and
  which skills they asked for. No forecasting, no "the market is shifting".
- **First-person plural.** The newsletter is Myro speaking: "we read", "we
  split". Never "I". Per `brand-guidelines/voice.md`, and never mixed.
- **Lead with data, never with the premise.** If an insight came from a
  conversation, it earns one line as the reason for the cut, after the numbers.
- **Show the check that failed.** If a piece of received wisdom was tested and
  came back different, say so in the issue. That is the difference between
  analysis and content.
- **Write the positive half.** "It is X, not Y" and "the offices are there, the
  hiring is not" are the house tell. State what is true and let the contrast
  land on its own: "a Mumbai office is a satellite, a Bengaluru office is the
  engine." Grep every draft for `is not`, `are not`, `rather than`, `nothing
  about` before shipping.
- **Verify every claim before writing it.** Issue 019's best line ("19 tech
  employers post in Mumbai at 2.6 roles each against Bengaluru's 20.4") only
  exists because an unverified sentence was checked and turned out false.

## Skills data: filter before publishing

`jobs.main_skills` is model-extracted and mixes real signal with noise. Real:
`Python (Programming Language)`, `Risk Management`, `Regulatory Requirements`.
Noise seen so far: `Track (Rail Transport)` (taxonomy mis-map of the word
"track"), `Siddhi` (an Axis product name), `SMS`, `Hygiene`, plus EEO boilerplate
(`Diversity And Inclusion`, `Disabilities`) and soft-skill filler
(`Communication`, `Problem Solving`).

Apply a stoplist, set a frequency floor, and eyeball the final list before it
ships. Never publish the field raw.

**Company boilerplate is the larger trap.** The extractor reads an employer's
"about us" text as skills, so every posting that repeats it gets the same
credits. Issue 25: EY's consulting-practice paragraph put `Internal Controls` on
236 of 575 EY postings; its role text names internal control in 45. A skill that
one employer holds 80%+ of is the tell. Count from the posting's own text
instead: drop every sentence an employer repeats across a quarter or more of its
postings in the lane, then match skill terms in what is left. Say so in the
dataset methodology.

## The CTA lane

One CTA per issue: "Tailor your CV to jobs like these" (Shivam, 2026-10-23). The
Myro Score is what the machine knows about you, and the tailored CV is the
product, so no issue sells the Score.

`components/newsletter/issue-cta.tsx` renders it from the template. Issue bodies
carry no signup link and no `<NewsletterCTA>`; `newsletter-cta-routing.test.ts`
holds that. It links to
`/signup?utm_source=newsletter&utm_medium=article&utm_campaign=issue-0XX`. A first
signup lands on `/onboarding`, the front door into the loop, so no carried intent
is needed. A signed-in reader goes to `/market`.

Substack has no template, so `scripts/newsletter_substack/convert.py` appends the
same CTA with `utm_source=substack`.

## Before shipping

`write-like-human` lint clean, `brand-guidelines` voice matrix respected,
600–1200 body words, the five build gates green, and the angle, heading and chart
agreed with Shivam before drafting.

The next piece to push is the first row in [NEWSLETTER_QUEUE.md](NEWSLETTER_QUEUE.md).
Take the issue number from that file. The numbers inside `Myro Newsletter/scaffolds/`
are retired.
