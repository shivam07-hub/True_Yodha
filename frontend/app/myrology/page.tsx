"use client"

import "./myrology.css"
import { BrandParticles } from "@/components/brand/brand-particles"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { LockedOnly, MyrologyCta, MyrologyProvider } from "./checkout"
import { OfferingSection } from "./offering-section"

const HOUSES = ["Career", "Income", "Wisdom", "Travel", "Self", "Skills", "Method", "Partners", "Risk", "Public", "Network", "Sanctum"]
const GLYPHS = ["♄", "♃", "♂", "☉", "♀", "☿", "☾", "♅", "♆", "♇", "⊕", "★"]
const VALS = [0.92, 0.78, 0.84, 0.55, 0.81, 0.62, 0.71, 0.66, 0.48, 0.74, 0.82, 0.69]

function CosmicRadar() {
  const cx = 200
  const cy = 200
  const R = 160
  const pts = HOUSES.map((_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
    const r = VALS[i] * R
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const
  })
  const polyPts = pts.map((p) => p.join(",")).join(" ")

  return (
    <svg className="cosmic-svg" viewBox="0 0 400 400" role="img" aria-label="Birth-chart career radar">
      <g className="ring-grid">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={cx} cy={cy} r={R * f} />
        ))}
      </g>
      <g className="ring-grid">
        {HOUSES.map((h, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2
          return <line key={h} x1={cx} y1={cy} x2={cx + Math.cos(a) * R} y2={cy + Math.sin(a) * R} />
        })}
      </g>
      <circle cx={cx} cy={cy} r="34" fill="none" className="ring-axis" />
      <circle cx={cx} cy={cy} r="22" fill="rgba(176, 132, 255, 0.06)" stroke="var(--my-amethyst)" strokeWidth="1" />
      <text className="ring-center" x={cx} y={cy + 4} textAnchor="middle">MYRO</text>
      <polygon className="ring-fill" points={polyPts} />
      {pts.map((p, i) => (
        <circle key={HOUSES[i]} className="ring-node" cx={p[0]} cy={p[1]} r="3" />
      ))}
      {HOUSES.map((h, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2
        const rL = R + 22
        const rG = R + 6
        return (
          <g key={h}>
            <text className="ring-glyph" x={cx + Math.cos(a) * rG} y={cy + Math.sin(a) * rG + 4} textAnchor="middle">{GLYPHS[i]}</text>
            <text className="ring-label" x={cx + Math.cos(a) * rL} y={cy + Math.sin(a) * rL + 3} textAnchor="middle">{h.toUpperCase()}</text>
          </g>
        )
      })}
    </svg>
  )
}

const READINGS = [
  { glyph: "♃", name: "Jupiter in Career", meta: "Expansion · 10th house", val: "STRONG" },
  { glyph: "☿", name: "Mercury retrograde", meta: "Caution · communication", val: "WATCH" },
  { glyph: "♂", name: "Mars in Skills", meta: "Drive · technical depth", val: "STRONG" },
  { glyph: "♄", name: "Saturn discipline", meta: "Long-game · 6 yr arc", val: "STEADY" },
]

const ASTRO_CELLS = [
  { glyph: "☉", name: "SUN SIGN", val: "Libra", meta: "15° 24′" },
  { glyph: "☽", name: "MOON", val: "Pisces", meta: "8° 11′" },
  { glyph: "↑", name: "ASCENDANT", val: "Capricorn", meta: "2° 47′" },
  { glyph: "⚝", name: "NAKSHATRA", val: "Uttara", meta: "pada 3" },
  { glyph: "⚭", name: "DASHA", val: "Jupiter", meta: "5y 7m left" },
  { glyph: "◐", name: "PAKSHA", val: "Shukla", meta: "waxing" },
  { glyph: "⚹", name: "YOGA", val: "Siddha", meta: "auspicious" },
  { glyph: "◇", name: "CHANDRA RASHI", val: "Meena", meta: "water · mutable" },
]

const METHOD_CHIPS = ["Vedic", "KP astrology", "Intuitive energy reading"]

const FAQS: [string, string][] = [
  ["Do I need to share my birth time?", "For the most precise chart we use date, time and place of birth. If you don't know your exact time, the astrologer can rectify it in the first session."],
  ["Whose astrology is this?", "One in-house, research-oriented astrologer reads every chart — Vedic and KP, sharpened by years of intuitive practice. We don't rotate you through a roster."],
  ["What if the reading conflicts with my plan?", "It often will. The point isn't obedience — it's a second signal. Combine it with the data Myro gives you and decide."],
  ["Is my data private?", "Yes. We ask for date, time and place of birth — never your name. Birth details are never sold or shared, and the astrologer stays anonymous too."],
  ["Can I cancel?", "7-day refund, no questions. If the report hasn't been delivered yet, full refund. After delivery, partial based on sessions used."],
]

export default function MyrologyPage() {
  return (
    <div className="myrology-root">
      <div className="m-bg">
        <BrandParticles density={0.45} accent="#B084FF" />
      </div>

      <PublicTopNav showSignIn />

      <MyrologyProvider>
      <main className="m-main">
        <section className="my-hero">
          <div className="my-hero-eyebrow">
            <span className="dot pulse" />
            MYRO · MYROLOGY · LAUNCH TIER
          </div>
          <h1 className="my-hero-h">
            <span className="hi">Sitaaron se taiyaar career.</span>
            <span className="en">Career, aligned to your chart.</span>
          </h1>
          <p className="my-hero-sub">
            A second signal beside your data. One research-oriented astrologer reads your chart —
            3 sessions and a written report — so you know when to move and when to wait.
            One-time <span style={{ color: "var(--my-amethyst)", fontWeight: 600 }}>₹499</span>.
            <br />
            <span className="my-hero-privacy">Three facts — date, time, place. No name, yours or his.</span>
          </p>
        </section>

        <section className="block" style={{ marginTop: 24 }}>
          <div className="cosmic">
            <div><CosmicRadar /></div>
            <div className="cosmic-body">
              <div className="cosmic-eyebrow">YOUR CHART · CAREER SIGNAL</div>
              <div className="cosmic-title">Twelve houses. One trajectory.</div>
              <div className="cosmic-desc">
                The same domain radar you&apos;ve used for skills — recomposed as your natal chart.
                Each axis is a life-domain. Each glyph is a planet. Where the polygon swells,
                your career compounds. Where it dips, we counsel you to wait.
              </div>
              <div className="cosmic-readings">
                {READINGS.map((r) => (
                  <div key={r.name} className="reading">
                    <div className="reading-glyph">{r.glyph}</div>
                    <div>
                      <div className="reading-name">{r.name}</div>
                      <div className="reading-meta">{r.meta}</div>
                    </div>
                    <div className="reading-val">{r.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="astro-grid">
            {ASTRO_CELLS.map((c) => (
              <div key={c.name} className="astro-cell">
                <div className="astro-glyph">{c.glyph}</div>
                <div className="astro-name">{c.name}</div>
                <div className="astro-val">{c.val}</div>
                <div className="astro-meta">{c.meta}</div>
              </div>
            ))}
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
                No name, no photo. Privacy runs both ways at Myro: you give three facts, he reads
                the chart, and neither of you trades an identity to do it.
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

        <LockedOnly>
          <section className="block">
            <div className="bridge">
              <div className="bridge-mark">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                  <circle cx="20" cy="20" r="6" fill="currentColor" opacity="0.9" />
                  <ellipse cx="20" cy="20" rx="16" ry="5.5" stroke="currentColor" strokeWidth="1.2" transform="rotate(-22 20 20)" />
                  <circle cx="34" cy="14" r="1.5" fill="currentColor" />
                  <circle cx="6" cy="26" r="1.2" fill="currentColor" />
                </svg>
              </div>
              <div>
                <div className="bridge-eyebrow">READY TO UNLOCK</div>
                <div className="bridge-title">Your chart is already cast. We just haven&apos;t read it yet.</div>
                <div className="bridge-desc">
                  Unlock once. We collect three facts — date, time, place — and the astrologer
                  prepares your chart and report, then you request your first session.
                </div>
              </div>
              <MyrologyCta variant="bridge" />
            </div>
          </section>
        </LockedOnly>

      </main>
      </MyrologyProvider>
      <PublicFooter />
    </div>
  )
}
