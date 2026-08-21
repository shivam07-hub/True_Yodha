"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"
import type { NameCountItem, SkillCountItem } from "@/lib/api"
import { LandingScoreSample } from "./score-sample"
import { LandingMatchSample } from "./how-it-works"
import { LandingLiveSample } from "./live-sample"
import { LandingPipelineSample } from "./pipeline-sample"
import { LandingIntelSample } from "./intel-sample"

const SAMPLES = [
  { id: "tailor", label: "01 · tailor & apply" },
  { id: "live", label: "02 · live job data" },
  { id: "pipeline", label: "03 · pipeline tracker" },
  { id: "intel", label: "04 · company intel" },
] as const

type SampleId = (typeof SAMPLES)[number]["id"]

export function LandingUseCases({
  companyNames,
  companiesMonitored,
  skillsMapped,
  companies,
  industries,
  topSkills,
}: {
  companyNames: string[]
  companiesMonitored: number
  skillsMapped: number
  companies: NameCountItem[]
  industries: NameCountItem[]
  topSkills: SkillCountItem[]
}) {
  const [sample, setSample] = useState<SampleId>("tailor")
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function move(from: number, key: string) {
    const last = SAMPLES.length - 1
    let next = from
    if (key === "ArrowRight" || key === "ArrowDown") next = from === last ? 0 : from + 1
    else if (key === "ArrowLeft" || key === "ArrowUp") next = from === 0 ? last : from - 1
    else if (key === "Home") next = 0
    else if (key === "End") next = last
    else return null
    return next
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = move(index, event.key)
    if (next === null) return
    event.preventDefault()
    setSample(SAMPLES[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <section className="lp-usecases" id="use-cases" aria-labelledby="lp-usecases-title">
      <div className="lp-wrap">
        <div className="lp-usecases-head">
          <h2 className="lp-section-title" id="lp-usecases-title">Four things, one loop.</h2>
          <p className="lp-section-sub lp-usecases-note">
            Pick one — the real product, not a screenshot.
          </p>
        </div>

        <div className="lp-hub">
          <div role="tablist" aria-label="What Myro does after you upload" className="lp-hub-tabs">
            {SAMPLES.map((item, index) => {
              const selected = sample === item.id
              return (
                <button
                  key={item.id}
                  ref={(node) => { tabRefs.current[index] = node }}
                  type="button"
                  role="tab"
                  id={`tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={cn("lp-hub-tab", selected && "is-active")}
                  onClick={() => setSample(item.id)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                >
                  {/* The indicator is an element, not a border: it has to overlap
                      the tablist hairline so the tab joins its panel. */}
                  {selected ? <span className="lp-hub-tab-mark" aria-hidden="true" /> : null}
                  <span className="lp-hub-tab-label">{item.label}</span>
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id="panel-tailor"
            aria-labelledby="tab-tailor"
            hidden={sample !== "tailor"}
            className="lp-hub-panel"
          >
            <LandingScoreSample />
            <LandingMatchSample />
          </div>

          <div
            role="tabpanel"
            id="panel-live"
            aria-labelledby="tab-live"
            hidden={sample !== "live"}
            className="lp-hub-panel"
          >
            <LandingLiveSample
              companies={companies}
              companyNames={companyNames}
              companiesMonitored={companiesMonitored}
              skillsMapped={skillsMapped}
            />
          </div>

          <div
            role="tabpanel"
            id="panel-pipeline"
            aria-labelledby="tab-pipeline"
            hidden={sample !== "pipeline"}
            className="lp-hub-panel"
          >
            <LandingPipelineSample />
          </div>

          <div
            role="tabpanel"
            id="panel-intel"
            aria-labelledby="tab-intel"
            hidden={sample !== "intel"}
            className="lp-hub-panel"
          >
            <LandingIntelSample
              companies={companies}
              industries={industries}
              topSkills={topSkills}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
