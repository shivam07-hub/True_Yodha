"use client"

import { useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { FAQ_ITEMS, PRICING_FREE, PRICING_PAID, PRICING_LEAD, PRICING_FOOTNOTE } from "./landing-copy"
import { LandingDropzone } from "./dropzone"
import type { AnonScoreResponse } from "@/lib/api"

interface LandingFaqProps {
  scoring?: boolean
  scoreError?: string | null
  onScoring?: () => void
  onResult?: (result: AnonScoreResponse, file: File) => void
  onError?: (message: string) => void
}

export function LandingFaq({ scoring, scoreError, onScoring, onResult, onError }: LandingFaqProps) {
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

        <div className="lp-pricing lp-reveal" aria-label="What's free and what spends Myro Coins">
          <p className="lp-pricing-lead">{PRICING_LEAD}</p>
          <div className="lp-pricing-grid">
            <div className="lp-pricing-col">
              <span className="lp-pricing-head">Free, always</span>
              <ul className="lp-pricing-list">
                {PRICING_FREE.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="lp-pricing-col">
              <span className="lp-pricing-head paid">Uses Myro Coins</span>
              <ul className="lp-pricing-list">
                {PRICING_PAID.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="lp-pricing-foot">
            <p className="lp-pricing-foot-line">{PRICING_FOOTNOTE}</p>
            <a className="lp-pricing-link" href="/docs">
              How the Myro Engine works <span aria-hidden>→</span>
            </a>
          </div>
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
          <LandingDropzone
            source="landing_dropzone_closing"
            busy={scoring}
            onScoring={onScoring}
            onResult={onResult}
            onError={onError}
          />
          {scoreError && (
            <p className="lp-dropzone-error" role="alert">
              {scoreError}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
