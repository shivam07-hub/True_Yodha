"use client"

import { MyrologyCta, useMyrology } from "./checkout"
import { MyrologyUnlockedPanel } from "./unlocked-panel"

const INCLUSIONS = [
  {
    title: "Full written birth-chart report",
    meta: "All 12 houses · career timings · best-fit careers · chances of going abroad · the industry that suits your chart",
  },
  {
    title: "3 lifetime astrologer sessions",
    meta: "One-on-one video calls with our in-house astrologer — go deeper on the report, used across your life",
  },
  {
    title: "Prepared and shared by our team",
    meta: "We build the report from your details and reach out — no live call needed to begin",
  },
]

const FLOW_STEPS = [
  { l: "01 · Your birth details", v: "~2 min · before you pay" },
  { l: "02 · Pay ₹299", v: "one-time" },
  { l: "03 · Report prepared", v: "by the astrologer" },
  { l: "04 · Sessions", v: "3, by request, lifetime" },
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
        <h3 className="price-name">Career, aligned to your stars.</h3>
        <div className="price-tagline">A second signal beside your data. One price, the whole arc.</div>
        <div className="price-amount">
          <span className="price-cur">₹</span>
          <span className="price-num">299</span>
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
          <div className="side-eyebrow">HOW IT WORKS</div>
          <div className="side-list">
            {FLOW_STEPS.map((s) => (
              <div key={s.l} className="side-row"><span className="l">{s.l}</span><span className="v">{s.v}</span></div>
            ))}
          </div>
        </div>
        <div className="side-card">
          <div className="side-eyebrow">WHAT WE&apos;LL ASK FOR</div>
          <div className="side-text">
            Date of birth · time of birth · place of birth.<br />
            That&apos;s the whole list. Filled before you pay, kept to your stars.
          </div>
        </div>
      </div>
    </div>
  )
}

export function OfferingSection() {
  const { phase } = useMyrology()
  const started = phase === "intake" || phase === "pay" || phase === "booking"
  return (
    <section className="block">
      <div className="block-eyebrow">{started ? "YOUR MYROLOGY" : "THE OFFERING · ONE PRICE"}</div>
      {started ? (
        <div className="price-row price-row--single">
          <MyrologyUnlockedPanel />
        </div>
      ) : (
        <LockedOffering />
      )}
    </section>
  )
}
