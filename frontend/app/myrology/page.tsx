"use client"

import "./myrology.css"
import "./myrology-offer.css"
import "./myrology-lenses.css"
import { BrandParticles } from "@/components/brand/brand-particles"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { MyrologyProvider } from "./checkout"
import { OfferingSection } from "./offering-section"
import { LiveIndexPanel } from "./live-index-panel"
import { ChartLensPanel } from "./chart-lens"
import { TwoLensSection } from "./two-lens"

const METHOD_CHIPS = ["Vedic", "KP astrology", "Intuitive energy reading"]

/* Refund wording tracks Terms §07 verbatim — full refund before delivery,
   non-refundable after. It previously promised a partial post-delivery refund,
   which the Terms page has never offered. */
const FAQS: [string, string][] = [
  [
    "Do I need my exact birth time?",
    "A precise chart wants date, time and place. If you only know it within an hour or two, say so in the form — the astrologer rectifies it and tells you what he changed.",
  ],
  [
    "What if the reading contradicts my plan?",
    "It often will, and we print both sides rather than picking for you. The market half of the report is checkable today; use it as the tiebreaker.",
  ],
  [
    "Whose astrology is this?",
    "One in-house, research-oriented astrologer reads every chart — Vedic and KP, sharpened by years of intuitive practice. The same person, start to finish.",
  ],
  [
    "Who sees my birth details?",
    "The astrologer, plus the people at Myro who run delivery. Your name is not attached to the chart. Delete it any time from Settings → Data.",
  ],
  [
    "Is the hiring data really live?",
    "The counts come from the same index that powers Jobs. Your report carries the date it was run, and the market half can be re-run whenever you want it refreshed.",
  ],
  [
    "Can I get a refund?",
    "Full refund any time before delivery, no questions. Once the consultation has been delivered the work is done and the fee is non-refundable — one rule, same as the Terms page.",
  ],
]

export default function MyrologyPage() {
  // Myrology is the one dark-surface island in an otherwise light app — the
  // cosmic sub-brand reads as night sky. The dark surface is pinned by CSS
  // (`.myrology-root` joins the dark base in design-tokens.css), so it renders
  // dark on first paint regardless of the global surface pref — no post-mount
  // data-surface flip, no flash, no leaking dark onto the page you navigate to.
  return (
    <div className="myrology-root">
      <div className="m-bg">
        <BrandParticles density={0.9} accent="#B084FF" />
      </div>

      <PublicTopNav showSignIn />

      <MyrologyProvider>
      <main className="m-main">
        <section className="my-hero my-hero--split">
          <div>
            <div className="my-hero-eyebrow">
              <span className="dot pulse" />
              MYRO · MYROLOGY · LAUNCH TIER
            </div>
            <h1 className="my-hero-h">
              The stars show the way.{" "}
              <span className="my-hero-glow">Align with it to get hired.</span>
            </h1>
            <p className="my-hero-sub">
              Myro reads your birth chart to understand the energies aligned to your work, then maps
              it against every opening on the career pages — so a direction arrives with the number
              of jobs behind it.
              <br />
              <span className="my-hero-privacy">Three facts — date, time, place.</span>
            </p>
          </div>

          <LiveIndexPanel />
        </section>

        <TwoLensSection />

        <section className="block">
          <div className="block-eyebrow">TWO LENSES · NEVER AVERAGED</div>
          <div className="lens-row">
            <ChartLensPanel />
            <div className="lens-card lens-card--live">
              <div className="lens-tag lens-tag--live">
                <span className="dot pulse" />
                MYRO LIVE DATA
              </div>
              <div className="lens-prose">
                <p>
                  The market half of your report is not written by anyone. It is the same index that
                  powers Jobs, queried for the families and industries your chart points at, and
                  stamped with the date it ran.
                </p>
                <p>
                  That is why the two halves stay apart. A chart cannot be checked. A count can — and
                  when they disagree we print both, rather than blending them into one number that
                  hides which half you are actually trusting.
                </p>
              </div>
            </div>
          </div>
        </section>

        <OfferingSection />

        <section className="block">
          <div className="block-eyebrow">YOUR ASTROLOGER · ONE, RESEARCH-ORIENTED</div>
          <div className="astrologer">
            <div className="astrologer-mark" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <circle cx="22" cy="22" r="7" fill="currentColor" opacity="0.9" />
                <ellipse cx="22" cy="22" rx="18" ry="6" stroke="currentColor" strokeWidth="1.2" transform="rotate(-24 22 22)" />
                <circle cx="38" cy="15" r="1.6" fill="currentColor" />
                <circle cx="7" cy="29" r="1.3" fill="currentColor" />
              </svg>
            </div>
            <div className="astrologer-body">
              <div className="astrologer-title">The one who stays behind the chart.</div>
              <div className="astrologer-chips">
                {METHOD_CHIPS.map((c) => <span key={c} className="expert-cred">{c}</span>)}
              </div>
              <p className="astrologer-bio">
                Our in-house astrologer reads Vedic and KP charts — but his edge is intuition:
                a trained sense for how the planets sit and where their energy pulls. He also
                <em> builds astrology AI agents</em>, so he knows exactly where the machines go wrong.
                That gap — between what an algorithm computes and what a chart actually means — is
                where his reading lives.
              </p>
              <p className="astrologer-bio astrologer-bio--dim">
                Privacy runs both ways at Myro: you give three facts, he reads the chart. Both sides
                stay anonymous by design — the work speaks for itself.
              </p>
            </div>
          </div>
        </section>

        <section className="block">
          <div className="block-eyebrow">COMMON QUESTIONS</div>
          <div className="faq">
            {FAQS.map(([q, a], i) => (
              <details key={q} className="faq-item" open={i === 0}>
                <summary className="faq-q">{q}</summary>
                <div className="faq-a">{a}</div>
              </details>
            ))}
          </div>
        </section>

      </main>
      </MyrologyProvider>
      <PublicFooter />
    </div>
  )
}
