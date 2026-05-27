"use client"

import { MyrologyCta, useMyrology } from "./checkout"
import { MyrologyUnlockedPanel } from "./unlocked-panel"

const INCLUSIONS = [
  { title: "3 × one-on-one sessions", meta: "60 min each · with our in-house astrologer · video" },
  { title: "Birth-chart career report", meta: "PDF · planetary positions + a written interpretation" },
  { title: "Role & industry alignment", meta: "Industries + role archetypes matched to your chart" },
]

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function LockedOffering() {
  return (
    <div className="price-row">
      <div className="price-card">
        <div className="price-eyebrow"><span className="dot pulse" /> MYRO · MYROLOGY</div>
        <h3 className="price-name">Career, aligned to your chart.</h3>
        <div className="price-tagline">A second signal beside your data. One price, the whole arc.</div>
        <div className="price-amount">
          <span className="price-cur">₹</span>
          <span className="price-num">499</span>
          <span className="price-period">one-time</span>
        </div>
        <div className="price-incl">
          {INCLUSIONS.map((item) => (
            <div key={item.title} className="incl-item">
              <div className="incl-icon"><CheckIcon /></div>
              <div>
                <div className="incl-text">{item.title}</div>
                <div className="incl-meta">{item.meta}</div>
              </div>
            </div>
          ))}
        </div>
        <MyrologyCta variant="price" />
      </div>

      <div className="price-side">
        <div className="side-card">
          <div className="side-eyebrow">AFTER YOU UNLOCK</div>
          <div className="side-list">
            <div className="side-row"><span className="l">01 · Birth details</span><span className="v">~2 min</span></div>
            <div className="side-row"><span className="l">02 · Chart prepared</span><span className="v">by the astrologer</span></div>
            <div className="side-row"><span className="l">03 · Report shared</span><span className="v">with you</span></div>
            <div className="side-row"><span className="l">04 · First session</span><span className="v">by request</span></div>
          </div>
        </div>
        <div className="side-card">
          <div className="side-eyebrow">WHAT WE&apos;LL ASK FOR</div>
          <div className="side-text">
            Date of birth · time of birth · place of birth.<br />
            No name. Collected after unlock, never sold, never shared.
          </div>
        </div>
        <div className="side-card" style={{ borderColor: "var(--my-amethyst-ring)" }}>
          <div className="side-eyebrow" style={{ color: "var(--my-amethyst)" }}>WHY ₹499</div>
          <div className="side-text">
            Launch tier — returns to ₹1,499 later. One astrologer, limited sessions per day,
            so slots move fast.
          </div>
        </div>
      </div>
    </div>
  )
}

export function OfferingSection() {
  const { phase } = useMyrology()
  const unlocked = phase === "intake" || phase === "booking"
  return (
    <section className="block">
      <div className="block-eyebrow">{unlocked ? "YOUR MYROLOGY · UNLOCKED" : "THE OFFERING · ONE PRICE"}</div>
      {unlocked ? (
        <div className="price-row price-row--single">
          <MyrologyUnlockedPanel />
        </div>
      ) : (
        <LockedOffering />
      )}
    </section>
  )
}
