"use client"

import Image from "next/image"
import { useRef } from "react"
import { useAllowLoopingMotion } from "@/lib/hooks/use-allow-looping-motion"

const FLOW_PATHS = [
  "M58,82 C150,82 162,232 224,232",
  "M58,172 C150,172 162,232 224,232",
  "M58,262 C150,262 162,232 224,232",
  "M58,352 C150,352 162,232 224,232",
  "M320,232 C350,232 344,76 382,76",
  "M320,232 C346,232 338,282 360,282",
]

interface LandingHeroEngineProps {
  companyNames: string[]
  companiesMonitored: number
}

/** Visual-only preview of the real product loop. The two numbers are labelled
 * examples so this never presents a sample score as the visitor's result. */
export function LandingHeroEngine({
  companyNames,
  companiesMonitored,
}: LandingHeroEngineProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const allowLoopingMotion = useAllowLoopingMotion(hostRef)
  const initials = companyNames.slice(0, 4).map((name) => name.charAt(0).toUpperCase())

  return (
    <div
      ref={hostRef}
      className="lp-mini-engine"
      data-motion={allowLoopingMotion ? "running" : "paused"}
      role="img"
      aria-label="Illustration of company career pages flowing through the Myro Engine into a CV score and job fit. Scores shown are examples."
    >
      <svg className="lp-mini-engine-svg" viewBox="0 0 560 440" aria-hidden="true">
        {FLOW_PATHS.map((path) => (
          <path key={path} className="lp-mini-flow" d={path} />
        ))}
      </svg>

      <div className="lp-me-sources" aria-hidden="true">
        {(initials.length ? initials : ["", "", "", ""]).map((initial, index) => (
          <span className={initial ? "lp-me-chip" : "lp-me-chip lp-me-chip-loading"} key={`${initial}-${index}`}>
            {initial}
          </span>
        ))}
        <small>{companiesMonitored}+ career pages</small>
      </div>

      <div className="lp-me-core" aria-hidden="true">
        <Image src="/brand/myro-mark.png" alt="" width={58} height={58} />
        <span>The Myro Engine</span>
      </div>

      <div className="lp-me-match" aria-hidden="true">
        <small>Example role fit</small>
        <strong>87 <span>/ 100</span></strong>
        <div><span /></div>
      </div>

      <div className="lp-me-cv" aria-hidden="true">
        <span className="lp-me-evidence">+ CV evidence mapped</span>
        <strong>Your CV</strong>
        <small>title · contact</small>
        <b>Profile</b>
        <i className="is-long" />
        <i className="is-mid" />
        <b>Experience</b>
        <i className="is-accent is-long" />
        <i className="is-mid" />
        <i className="is-short" />
        <b>Skills</b>
        <i className="is-mid" />
        <span className="lp-me-score">Example Myro Score <strong>82</strong> /100</span>
      </div>
    </div>
  )
}
