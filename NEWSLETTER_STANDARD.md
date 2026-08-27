# The Myro newsletter standard
### Set 2026-08-26 from Issue 019. This is the default, not one issue's format.

An issue is written **slide-first**. Each section is a self-contained piece of
knowledge that stands alone on a phone screen, because the same sentences ship
as the LinkedIn and Instagram carousel with no rewrite. If a paragraph cannot
survive being screenshotted on its own, it is not finished.

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
6. **Footer CTA into Preparation.** One only.

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
   pages of MNCs and what skills they hire for" earns the click; "practise your
   skills" alone does not.

Deliberately absent from the gold version: career-stage blocks (Early / Mid /
Senior). `myro-newsletter Skills/page-anatomy.md` calls them load-bearing. They
are not, when every section is already addressed to one reader type by name.

## Carousel hierarchy: one accent role at a time

Shipped wrong once and caught by Shivam, 2026-08-26. A slide read
kicker-then-lead where both were mint, and the lead was 46px bold against the
kicker's 25px, so the section label lost to the line beneath it and the block
had no top.

The token roles on a slide, in order:

| Level | Treatment | Accent |
|---|---|---|
| Section label (kicker) | 28px mono, uppercase, letterspaced, short rule beneath | mint |
| Lead statement | 46px, weight 680 | Bone (`--fg`) |
| Body | 46px, weight 440 | Bone |
| The one number that matters | `<span class="hl">` | mint |

Mint appears **twice per slide at most**: the label and one figure. `<b>` inside
prose is Bone bold and never mint — bold and accent together outrank a label
that sits above them, which inverts the hierarchy. This is the visual half of
`three-accent-budget.md`; the earlier slide spent four accent uses on one screen.

## Rules that are not negotiable

- **Skills are the driver.** Every lane ends in skills a real posting named this
  month. That column is why the reader clicks through to Preparation.
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

## The CTA lane

The footer CTA links to
`https://www.himyro.com/signup?intent=prep&ref=newsletter-0XX`.

`?intent=prep` is a carried-intent marker (`frontend/lib/prep-intent-stash.ts`);
`postAuthDestination` reads it and lands the reader on `/preparations` instead of
the default surface. A marker, never a URL — the 2026-07-11 rule that login ends
on a known surface still holds, and `next` stays deleted.

## Before shipping

`write-like-human` lint clean, `brand-guidelines` voice matrix respected,
600–1200 body words, the five build gates green, and the angle, heading and chart
agreed with Shivam before drafting.
