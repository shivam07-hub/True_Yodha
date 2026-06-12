"use client"

import { useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { FAQ_ITEMS } from "./landing-copy"
import { LandingDropzone } from "./dropzone"

export function LandingFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])

  function toggle(idx: number) {
    setOpenIdx((prev) => (prev === idx ? null : idx))
  }

  return (
    <section className="lp-faq" aria-label="Questions and closing call to action">
      <div className="lp-wrap">
        <div className="lp-section-head center lp-reveal">
          <span className="lp-eyebrow">Questions</span>
          <h2 className="lp-section-title">Free to start. Private by default.</h2>
        </div>

        <div className="lp-faq-list lp-reveal">
          {FAQ_ITEMS.map((item, idx) => {
            const open = openIdx === idx
            return (
              <div className={`lp-faq-item${open ? " open" : ""}`} key={item.q}>
                <button
                  type="button"
                  className="lp-faq-q"
                  aria-expanded={open}
                  onClick={() => toggle(idx)}
                >
                  <span>{item.q}</span>
                  <span className="lp-faq-chevron" aria-hidden>
                    <ChevronDown size={18} strokeWidth={1.5} />
                  </span>
                </button>
                <div
                  className="lp-faq-a"
                  ref={(el) => {
                    panelRefs.current[idx] = el
                  }}
                  style={{
                    maxHeight: open ? (panelRefs.current[idx]?.scrollHeight ?? 600) : 0,
                  }}
                >
                  <div className="lp-faq-a-inner">{item.a}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="lp-closing lp-reveal">
          <span className="lp-eyebrow">Start here</span>
          <p className="lp-closing-line">
            Ten minutes from now you&rsquo;ll have a scored, job-ready CV. Start there.
          </p>
          <LandingDropzone source="landing_dropzone_closing" />
        </div>
      </div>
    </section>
  )
}
