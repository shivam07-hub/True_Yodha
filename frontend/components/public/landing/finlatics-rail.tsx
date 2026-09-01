"use client"

import { useRef } from "react"
import Image from "next/image"
import {
  FINLATICS_BRAND_LABEL,
  FINLATICS_LOGO_SRC,
  FINLATICS_PROGRAMS,
  finlaticsHref,
} from "@/lib/finlatics-programs"
import { useAllowLoopingMotion } from "@/lib/hooks/use-allow-looping-motion"

/**
 * Partner course ticker. Same furniture as the company career-page rail:
 * duplicated track, compositor scroll, paused off-screen and on reduced motion.
 * Sits between the use-cases headings so the Finlatics catalogue is visible
 * before the four product surfaces.
 */
export function LandingFinlaticsRail() {
  const hostRef = useRef<HTMLElement | null>(null)
  const allowLoopingMotion = useAllowLoopingMotion(hostRef)

  return (
    <section
      ref={hostRef}
      className="lp-company-rail lp-partner-rail"
      data-motion={allowLoopingMotion ? "running" : "paused"}
      aria-label="Finlatics training programs"
    >
      <p>
        <Image
          src={FINLATICS_LOGO_SRC}
          alt=""
          width={28}
          height={26}
          className="lp-partner-rail-logo"
        />
        <strong>{FINLATICS_BRAND_LABEL}</strong>
      </p>
      <div className="lp-company-rail-scroll">
        <div className="lp-company-rail-track">
          {[0, 1].map((copy) => (
            <div
              className="lp-company-rail-loop"
              key={copy}
              aria-hidden={copy === 1}
            >
              {FINLATICS_PROGRAMS.map((program) => (
                <a
                  className="lp-company-chip"
                  key={`${copy}-${program.id}`}
                  href={finlaticsHref(program)}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={copy === 1 ? -1 : undefined}
                >
                  <span aria-hidden="true">{program.mark}</span>
                  {program.title}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
