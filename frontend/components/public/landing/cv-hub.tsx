"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"
import type { NameCountItem } from "@/lib/api"
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
  companies,
}: {
  companyNames: string[]
  companiesMonitored: number
  companies: NameCountItem[]
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
                  id={`lp-hub-tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`lp-hub-panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={cn("lp-hub-tab", selected && "is-active")}
                  onClick={() => setSample(item.id)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id="lp-hub-panel-tailor"
            aria-labelledby="lp-hub-tab-tailor"
            hidden={sample !== "tailor"}
            className="lp-hub-panel lp-hub-tailor"
          >
            <LandingScoreSample />
            <LandingMatchSample companyNames={companyNames} companiesMonitored={companiesMonitored} />
          </div>

          <div
            role="tabpanel"
            id="lp-hub-panel-live"
            aria-labelledby="lp-hub-tab-live"
            hidden={sample !== "live"}
            className="lp-hub-panel"
          >
            <LandingLiveSample companies={companies} companyNames={companyNames} />
          </div>

          <div
            role="tabpanel"
            id="lp-hub-panel-pipeline"
            aria-labelledby="lp-hub-tab-pipeline"
            hidden={sample !== "pipeline"}
            className="lp-hub-panel"
          >
            <LandingPipelineSample />
          </div>

          <div
            role="tabpanel"
            id="lp-hub-panel-intel"
            aria-labelledby="lp-hub-tab-intel"
            hidden={sample !== "intel"}
            className="lp-hub-panel"
          >
            <LandingIntelSample companies={companies} />
          </div>
        </div>
      </div>
    </section>
  )
}
