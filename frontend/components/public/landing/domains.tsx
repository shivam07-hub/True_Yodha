"use client"

import { PUBLIC_SCORE_DOMAINS } from "@/lib/score-methodology"
import { SectionTitle } from "@/components/public/landing/section-title"

/* "What you're scored on" — the canonical Myro Score domains as chips.
   ND9: the names are NOT invented here. They come from lib/score-methodology.ts
   (PUBLIC_SCORE_DOMAINS), the single public-safe source the radar + score
   surfaces share. That list is 10 domains today — if it changes, this section
   changes with it (no hardcoded count, no parallel name list).
   Each chip jumps to #engine — the band where a logged-out user drops a CV and
   gets the real score across these domains. */
export function LandingDomains() {
  return (
    <section className="lp-domains" id="domains" aria-label="What your Myro Score measures">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <SectionTitle>What you&rsquo;re scored on.</SectionTitle>
          <p className="lp-section-sub">
            Your Myro Score reads across {PUBLIC_SCORE_DOMAINS.length} career domains — your CV
            against live demand in each.
          </p>
        </div>

        <ul className="lp-domain-chips lp-reveal">
          {PUBLIC_SCORE_DOMAINS.map((d) => (
            <li key={d.short}>
              <a className="lp-domain-chip" href="#engine" title={d.full}>
                {d.short}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
