"use client"

import { useMarketLens } from "./use-market-lens"

/* How a chart turns into a job search, and what happens when the two lenses
 * disagree.
 *
 * The strip and the four layers are one worked specimen — the same imagined
 * native as the wheel in `chart-lens.tsx`. They are marked as a specimen and
 * carry no live figures, because a real count sitting inside an invented chain
 * would read as this visitor's result. The only live number on the section is
 * the taxonomy width, which is a fact about the index and not about anybody's
 * chart. */

const STEPS = [
  { n: "01", head: "WORK PATTERN", body: "Depth over breadth, slow compounding", foot: "chart lens", lens: "chart" },
  { n: "02", head: "ROLE FAMILY", body: "Analytics / data engineering", foot: "one family picked", lens: "chart" },
  { n: "03", head: "INDUSTRY", body: "Healthcare & Life Sciences, BFSI", foot: "not just “Technology”", lens: "live" },
  { n: "04", head: "LEVEL", body: "2–5 years, IC track", foot: "where you actually are", lens: "live" },
  { n: "05", head: "DEMAND NOW", body: "Every matching opening", foot: "re-counted daily", lens: "live" },
] as const

const LAYERS = [
  {
    tag: "LAYER 1 · CHART LENS",
    lens: "chart",
    title: "How you tend to work",
    body: "Small teams, written thinking, one hard problem at a time. Energy peaks in the second half of the year. Struggles with performative urgency.",
  },
  {
    tag: "LAYER 2 · CHART LENS",
    lens: "chart",
    title: "Where that could fit",
    body: "Analytics engineering in regulated industries; research ops. Reasoning shown line by line, so you can argue with it.",
  },
  {
    tag: "LAYER 3 · MYRO LIVE DATA",
    lens: "live",
    title: "What is hiring now",
    body: "Open roles in those families, top cities, the skills asked for most, and live example jobs you can open today.",
  },
  {
    tag: "LAYER 4 · WHAT TO DO NEXT",
    lens: "astro",
    title: "One search move, one skill move",
    body: "A saved search in Jobs, and one Practice quest that closes the gap between your CV and those roles.",
  },
] as const

export function TwoLensSection() {
  const { totalIndustries, roleFamilies, taxonomyReady } = useMarketLens()

  return (
    <section className="block">
      <div className="block-eyebrow">HOW A CHART BECOMES A JOB SEARCH</div>

      <div className="step-strip">
        {STEPS.map((s) => (
          <div key={s.n} className="step" data-lens={s.lens}>
            <div className="step-head">{s.n} · {s.head}</div>
            <div className="step-body">{s.body}</div>
            <div className="step-foot">{s.foot}</div>
          </div>
        ))}
      </div>

      {taxonomyReady ? (
        <p className="step-note">
          Steps three to five run against{" "}
          <span className="mono live-em">{totalIndustries}</span> industry groups and{" "}
          <span className="mono live-em">{roleFamilies}</span> role families in the live index.
          The chart narrows; the index counts.
        </p>
      ) : null}

      <div className="layer-head">
        <div className="block-eyebrow">WHAT ₹299 BUYS · SPECIMEN CAREER MAP</div>
        <span className="layer-note">One worked example, not a reading of your chart</span>
      </div>

      <div className="layer-grid">
        {LAYERS.map((l) => (
          <div key={l.tag} className="layer" data-lens={l.lens}>
            <div className="layer-tag">{l.tag}</div>
            <div className="layer-title">{l.title}</div>
            <div className="layer-body">{l.body}</div>
          </div>
        ))}
      </div>

      <div className="verdicts">
        <div className="verdict" data-tone="agree">
          <div className="verdict-tag">✓ WHERE BOTH LENSES AGREE</div>
          <div className="verdict-body">
            Deep technical work with a long payoff curve. The chart says compounding;
            the index says the open analytics-engineering roles are mostly two to five years in.
          </div>
        </div>
        <div className="verdict" data-tone="disagree">
          <div className="verdict-tag">⚠ WHERE THEY DISAGREE</div>
          <div className="verdict-body">
            The chart likes an overseas move. The index sees thin visa-sponsored volume in
            these families. Both numbers stay on the page — we never average them into one
            score, and the decision stays yours.
          </div>
        </div>
      </div>
    </section>
  )
}
