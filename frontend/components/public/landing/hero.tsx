"use client"

import Image from "next/image"
import { LandingDropzone } from "./dropzone"
import { LandingStats } from "./stats"

const FLOW_PATHS = [
  "M63,93 C160,93 170,250 232,250",
  "M63,188 C160,188 170,250 232,250",
  "M63,283 C160,283 170,250 232,250",
  "M63,378 C160,378 170,250 232,250",
  "M328,250 C362,250 348,78 384,78",
  "M328,250 C340,250 338,295 352,295",
]

const PULSE_DELAYS = [0, 1.6, 3.1, 4.4, 2.4, 3.8]

const CHIP_POSITIONS = [
  { left: "3%", top: "14%" },
  { left: "3%", top: "33%" },
  { left: "3%", top: "52%" },
  { left: "3%", top: "71%" },
]

interface LandingHeroProps {
  /** "150+" — single-sourced live company count. */
  companiesLabel: string
  /** Real company names from the Engine corpus for the monogram chips. */
  companyNames: string[]
  /** Live Engine corpus counters — top-of-page credibility strip. */
  jobsTracked: number
  companiesMonitored: number
  skillsMapped: number
  seekers: number
}

function smoothScrollToEngine(e: React.MouseEvent) {
  e.preventDefault()
  const target = document.getElementById("engine")
  if (!target) return
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
}

export function LandingHero({
  companiesLabel,
  companyNames,
  jobsTracked,
  companiesMonitored,
  skillsMapped,
  seekers,
}: LandingHeroProps) {
  const chipInitials = (
    companyNames.length >= 4 ? companyNames.slice(0, 4) : ["Google", "Microsoft", "Amazon", "Netflix"]
  ).map((n) => n.charAt(0).toUpperCase())

  return (
    <section className="lp-hero" aria-label="Myro — the Career Intelligence Platform">
      <div className="lp-grid-bg" aria-hidden />
      <div className="lp-hero-glow" aria-hidden />

      <LandingStats
        jobsTracked={jobsTracked}
        companiesMonitored={companiesMonitored}
        skillsMapped={skillsMapped}
        seekers={seekers}
      />

      <div className="lp-wrap lp-hero-inner">
        <div className="lp-hero-left">
          <h1 className="lp-hero-h1">
            The Career Intelligence Platform.
            <span className="lp-hero-h1-sub">
              One engine reads the job market live. You get the CV that wins it.
            </span>
          </h1>

          <p className="lp-hero-support">
            Live openings from {companiesLabel} career pages, your CV scored against real demand,
            tailored per job — the first version in 10 minutes.
          </p>

          <div className="lp-hero-chips">
            <span className="lp-hero-chip accent">Live job data</span>
            <span className="lp-hero-chip">Scored 0–100</span>
            <span className="lp-hero-chip">Tailored per job</span>
            <span className="lp-hero-chip accent">10 minutes</span>
          </div>

          <LandingDropzone source="landing_dropzone_hero" />

          <a className="lp-hero-secondary" href="#engine" onClick={smoothScrollToEngine}>
            See the Engine <span aria-hidden>↓</span>
          </a>
        </div>

        {/* mini-engine: market in → engine → scored CV out */}
        <div className="lp-mini-engine" role="img" aria-label="The Myro Engine, at a glance">
          <svg className="lp-mini-engine-svg" viewBox="0 0 560 500" aria-hidden>
            {FLOW_PATHS.map((d) => (
              <path key={d} className="lp-mini-flow" d={d} />
            ))}
            {FLOW_PATHS.map((d, i) => (
              <path
                key={`p-${d}`}
                className="lp-mini-flow-pulse"
                style={{ animationDelay: `${PULSE_DELAYS[i]}s` }}
                d={d}
              />
            ))}
          </svg>

          {CHIP_POSITIONS.map((pos, i) => (
            <div key={i} className="lp-me-node" style={pos}>
              <span className="lp-me-chip">{chipInitials[i]}</span>
              {i === 3 && (
                <span className="lp-me-chip-label">{companiesLabel} career pages</span>
              )}
            </div>
          ))}

          <div className="lp-me-core">
            <Image src="/brand/aperture-m.png" alt="" width={58} height={58} aria-hidden />
            <span className="lp-me-core-label">The Myro Engine</span>
          </div>

          <div className="lp-me-match" style={{ right: 0, top: "8%" }}>
            <div className="lp-me-match-role">Senior PM</div>
            <div className="lp-me-match-fit">
              fit <strong>87 / 100</strong>
            </div>
            <div className="lp-me-match-bar">
              <span />
            </div>
          </div>

          <div className="lp-me-cv" style={{ right: "-1%", top: "38%" }}>
            <span className="lp-me-toast" role="status">
              <span className="lp-me-toast-plus" aria-hidden>
                +
              </span>
              <span>skill detected:</span>
              <span className="lp-me-toast-val">Stakeholder Mgmt L4</span>
            </span>
            <div className="lp-me-cv-name">Your Name</div>
            <div className="lp-me-cv-meta">title · contact</div>
            <div className="lp-me-cv-h">Profile</div>
            <span className="lp-me-cv-line l" />
            <span className="lp-me-cv-line m" />
            <div className="lp-me-cv-h">Experience</div>
            <span className="lp-me-cv-line hl l" />
            <span className="lp-me-cv-line m" />
            <span className="lp-me-cv-line s" />
            <div className="lp-me-cv-h">Skills</div>
            <span className="lp-me-cv-line m" />
            <span className="lp-me-cv-line s" />
            <div className="lp-me-score" aria-label="Myro Score 82 of 100">
              <span className="lp-me-score-lbl">Myro Score:</span>
              <span className="lp-me-score-num">82</span>
              <span className="lp-me-score-denom">/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* company marquee — the corpus, made visible (handoff priority directive) */}
      <div className="lp-marquee" aria-label={`Read live from ${companiesLabel} company career pages`}>
        <p className="lp-marquee-label">
          Read live from <strong>{companiesLabel} company career pages</strong>
        </p>
        {companyNames.length > 0 && (
          <div className="lp-marquee-viewport">
            <div className="lp-marquee-track">
              {[0, 1].map((dup) => (
                <div key={dup} className="lp-marquee-track-half" aria-hidden={dup === 1} style={{ display: "contents" }}>
                  {companyNames.map((name) => (
                    <span key={`${dup}-${name}`} className="lp-marquee-item">
                      <span className="lp-marquee-chip">{name.charAt(0).toUpperCase()}</span>
                      <span className="lp-marquee-name">{name}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
