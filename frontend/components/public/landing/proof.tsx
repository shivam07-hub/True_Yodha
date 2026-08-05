import Link from "next/link"
import { QUOTES } from "./landing-copy"
import { SectionTitle } from "./section-title"
import type { IntelTeaserRow } from "./use-landing-data"
import { formatDate } from "@/lib/format"

interface LandingProofProps {
  rows: IntelTeaserRow[]
  asOf: Date | null
}

export function LandingProof({ rows, asOf }: LandingProofProps) {
  const asOfLabel = asOf
    ? formatDate(asOf, "medium")
    : null

  return (
    <section className="lp-proof" id="proof" aria-label="Proof — the Engine, live">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <SectionTitle>The Engine, live.</SectionTitle>
        </div>

        <div className="lp-reveal">
          <div className="lp-intel-card">
            <div className="lp-intel-row head">
              <span>Company</span>
              <span>Open roles</span>
              <span>Top skill in demand</span>
            </div>
            {(rows.length > 0
              ? rows
              : [{ company: "Reading the market…", count: 0, topSkill: null }]
            ).map((row) => (
              <div className="lp-intel-row" key={row.company}>
                <span className="lp-intel-company">
                  <span className="lp-intel-mono-chip">{row.company.charAt(0).toUpperCase()}</span>
                  {row.company}
                </span>
                <span className="lp-intel-count">
                  {row.count > 0 ? `${row.count} roles · live` : "—"}
                </span>
                <span className="lp-intel-skill">
                  {row.topSkill ? (
                    <>
                      <span className="demand-dot" aria-hidden />
                      {row.topSkill}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="lp-intel-foot">
            <span className="lp-intel-asof">{asOfLabel ? `as of ${asOfLabel}` : " "}</span>
            <Link className="lp-ghost-link" href="/intel">
              Open Live Job Data <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <div className="lp-quotes">
          {QUOTES.map((q) => (
            <figure className="lp-quote lp-reveal" key={q.who}>
              <span className="lp-quote-mark" aria-hidden>
                &ldquo;
              </span>
              <blockquote className="lp-quote-text">{q.text}</blockquote>
              <figcaption className="lp-quote-who">
                <strong>{q.who}</strong> · {q.meta}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
