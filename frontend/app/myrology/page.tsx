"use client"

import Link from "next/link"
import "./myrology.css"
import { BrandParticles } from "@/components/brand/brand-particles"
import { MyroLogo } from "@/components/myro-logo"
import { PublicTopNav } from "@/components/public/top-nav"

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

const INCLUSIONS = [
  { title: "3 × one-on-one counselling sessions", meta: "60 min each · with a certified astrologer · video" },
  { title: "Personalised birth-chart career report", meta: "PDF · 24-page · planetary positions + interpretation" },
  { title: "Industry & role alignment", meta: "Top-7 industries + 12 role archetypes matched to your chart" },
  { title: "CV alignment with planetary strengths", meta: "Bullet-by-bullet rewrite tuned to your dominant houses" },
  { title: "Daily transit briefings (60 days)", meta: "In-app · when to apply · when to negotiate · when to wait" },
]

const EXPERTS = [
  { initials: "PJ", name: "Pt. Jagannath Rao", title: "Vedic · 22 yrs", creds: ["Jyotish Acharya", "KP system", "Vedic"], bio: "Specialises in career trajectory readings via the 10th-house ruler and Saturn placement. 4,200+ consultations.", stats: [["4,218", "readings"], ["4.9", "rating"], ["22y", "practice"]] },
  { initials: "AM", name: "Dr. Ananya Menon", title: "Western · 14 yrs", creds: ["ISAR-CAP", "AFA", "MD Counselling"], bio: "Bridges psychological astrology with career counselling — bringing chart insight into hard career decisions.", stats: [["2,914", "readings"], ["4.9", "rating"], ["14y", "practice"]] },
  { initials: "SK", name: "Acharya Suresh Khanna", title: "KP & Lal-Kitab · 28 yrs", creds: ["Lal-Kitab", "KP", "Numerology"], bio: "Combines Lal-Kitab remedies with modern career strategy. Known for grounded, action-oriented sessions.", stats: [["5,801", "readings"], ["4.8", "rating"], ["28y", "practice"]] },
]

const TESTIMONIALS = [
  { q: "The reading told me to wait six weeks before applying. I waited. Got the offer on the first attempt — at 1.6× my last salary.", who: "Rhea S.", meta: "Product Manager · Bengaluru", initials: "RS" },
  { q: "I had been chasing FAANG. The chart pointed to founder-track. Joined a 12-person startup, got equity. Best call I made.", who: "Arjun T.", meta: "Founding Engineer · Mumbai", initials: "AT" },
  { q: "Mercury retrograde — they actually told me to delay a contract. Saved me from a vendor who ghosted everyone else.", who: "Megha N.", meta: "Brand Strategist · Delhi", initials: "MN" },
]

const STATS = [
  { n: "12,914", l: "charts read", d: "+184 this week" },
  { n: "3,402", l: "offers landed", d: "after chart alignment" },
  { n: "96%", l: "first-session retention", d: "booked second" },
  { n: "4.9 / 5", l: "astrologer rating", d: "from 2,108 reviews" },
]

const FAQS: [string, string][] = [
  ["Do I need to share my birth time?", "Yes — for the most precise chart we need DOB, time, and place. If you don't know your exact time, our astrologers can do a rectification in the first session."],
  ["Is this Vedic or Western astrology?", "We offer both. You pick the system on your intake form — or get readings from astrologers in each tradition across your 3 sessions."],
  ["What if the reading conflicts with my plan?", "It often will. The point isn't obedience — it's a second signal. Combine it with the data Myro gives you and decide."],
  ["Can I cancel?", "7-day refund, no questions. If the report hasn't been delivered yet, full refund. After delivery, partial based on sessions used."],
]

export default function MyrologyPage() {
  return (
    <div className="myrology-root">
      <div className="m-bg">
        <BrandParticles density={0.45} accent="#B084FF" />
      </div>

      <PublicTopNav active="myrology" showSignIn />

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
            Career intelligence meets your birth chart. 3 sessions with a certified astrologer,
            a 24-page report, role &amp; industry alignment, and a CV tuned to your planetary strengths —
            for one-time <span style={{ color: "var(--my-amethyst)", fontWeight: 600 }}>₹499</span>.
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

        <section className="block">
          <div className="block-eyebrow">THE OFFERING · ONE PRICE</div>
          <div className="price-row">
            <div className="price-card">
              <div className="price-eyebrow"><span className="dot pulse" /> MYRO · MYROLOGY</div>
              <h3 className="price-name">Career, aligned to your chart.</h3>
              <div className="price-tagline">Earthly problems. Planetary solutions. One price, the whole arc.</div>
              <div className="price-amount">
                <span className="price-cur">₹</span>
                <span className="price-num">499</span>
                <span className="price-period">one-time · 60-day plan</span>
              </div>
              <div className="price-incl">
                {INCLUSIONS.map((item) => (
                  <div key={item.title} className="incl-item">
                    <div className="incl-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                    </div>
                    <div>
                      <div className="incl-text">{item.title}</div>
                      <div className="incl-meta">{item.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="price-cta">Unlock Myrology · Pay ₹499 →</button>
              <div className="price-cta-meta">
                <span>Secured by Razorpay · UPI · cards · wallets</span>
                <span className="mono">7-day refund</span>
              </div>
            </div>

            <div className="price-side">
              <div className="side-card">
                <div className="side-eyebrow">AFTER YOU PAY</div>
                <div className="side-list">
                  <div className="side-row"><span className="l">01 · Birth details</span><span className="v">~2 min</span></div>
                  <div className="side-row"><span className="l">02 · Chart computed</span><span className="v">~30s</span></div>
                  <div className="side-row"><span className="l">03 · Report delivered</span><span className="v">~12 hr</span></div>
                  <div className="side-row"><span className="l">04 · First session booked</span><span className="v">within 48 hr</span></div>
                </div>
              </div>
              <div className="side-card">
                <div className="side-eyebrow">WHAT WE&apos;LL ASK FOR</div>
                <div className="side-text">
                  Date of birth · time of birth · place of birth.<br />
                  Collected after payment, never sold, never shared.
                </div>
              </div>
              <div className="side-card" style={{ borderColor: "var(--my-amethyst-ring)" }}>
                <div className="side-eyebrow" style={{ color: "var(--my-amethyst)" }}>WHY ₹499</div>
                <div className="side-text">
                  Launch tier — first 1,000 operators only. Returns to ₹1,499 once full.
                  <div className="mono dim" style={{ marginTop: 8, fontSize: 11 }}>
                    seats remaining: <span style={{ color: "var(--my-amethyst)" }}>312 / 1,000</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="block">
          <div className="block-eyebrow">YOUR ASTROLOGERS · CERTIFIED &amp; PRACTISING</div>
          <div className="experts">
            {EXPERTS.map((e) => (
              <div key={e.name} className="expert">
                <div className="expert-head">
                  <div className="expert-avatar">{e.initials}</div>
                  <div>
                    <div className="expert-name">{e.name}</div>
                    <div className="expert-title">{e.title}</div>
                  </div>
                </div>
                <div className="expert-creds">
                  {e.creds.map((c) => <span key={c} className="expert-cred">{c}</span>)}
                </div>
                <div className="expert-bio">{e.bio}</div>
                <div className="expert-stats">
                  {e.stats.map((s) => (
                    <div key={s[1]}>
                      <div className="estat-val">{s[0]}</div>
                      <div className="estat-lab">{s[1]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-eyebrow">WHAT OPERATORS WHO BOUGHT IT SAY</div>
          <div className="testimonials">
            {TESTIMONIALS.map((t) => (
              <div key={t.who} className="myt-card">
                <div className="myt-quote">{t.q}</div>
                <div className="myt-foot">
                  <div className="myt-avatar">{t.initials}</div>
                  <div>
                    <div className="myt-who">{t.who}</div>
                    <div className="myt-meta">{t.meta}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-eyebrow">THE SHAPE OF MYROLOGY · IN NUMBERS</div>
          <div className="numbers">
            {STATS.map((it) => (
              <div key={it.l} className="num-card">
                <div className="num-val mono">{it.n}</div>
                <div className="num-lab">{it.l}</div>
                <div className="num-delta">{it.d}</div>
              </div>
            ))}
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
                Pay once. We&apos;ll collect your birth details, compute the chart in 30 seconds,
                and deliver your report within 12 hours. First session bookable within 48 hours.
              </div>
            </div>
            <div className="bridge-cta">
              <div className="bridge-price">
                <span className="mono big">₹499</span>
                <span className="bridge-once">one-time</span>
              </div>
              <span className="bridge-arrow">Pay &amp; start →</span>
            </div>
          </div>
        </section>

        <footer className="foot">
          <div className="foot-left">
            <MyroLogo size={18} decorative />
            <span>Myro · Myrology · cosmic career intelligence</span>
          </div>
          <div className="foot-right mono dim">
            <Link href="/welcome">← back to Day 1</Link>
          </div>
        </footer>
      </main>
    </div>
  )
}
