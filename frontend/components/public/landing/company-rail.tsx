"use client"

import { useRef } from "react"
import { formatCount } from "@/lib/format"
import { useAllowLoopingMotion } from "@/lib/hooks/use-allow-looping-motion"

interface LandingCompanyRailProps {
  companyNames: string[]
  companiesMonitored: number
}

export function LandingCompanyRail({
  companyNames,
  companiesMonitored,
}: LandingCompanyRailProps) {
  const hostRef = useRef<HTMLElement | null>(null)
  const allowLoopingMotion = useAllowLoopingMotion(hostRef)
  const visibleNames = companyNames.slice(0, 12)

  return (
    <section
      ref={hostRef}
      className="lp-company-rail"
      data-motion={allowLoopingMotion ? "running" : "paused"}
      aria-label="Company career pages tracked by Myro"
    >
      <p>
        Read live from <strong>{formatCount(companiesMonitored)}+ company career pages</strong>
      </p>
      <div className="lp-company-rail-scroll">
        <div className="lp-company-rail-track" aria-busy={!visibleNames.length}>
          {[0, 1].map((copy) => (
            <div
              className="lp-company-rail-loop"
              key={copy}
              aria-hidden={copy === 1 || !visibleNames.length}
            >
              {visibleNames.length ? (
                visibleNames.map((name) => (
                  <span className="lp-company-chip" key={`${copy}-${name}`}>
                    <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                    {name}
                  </span>
                ))
              ) : (
                Array.from({ length: 7 }, (_, index) => (
                  <span className="lp-company-chip-skeleton" key={`${copy}-${index}`} />
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
