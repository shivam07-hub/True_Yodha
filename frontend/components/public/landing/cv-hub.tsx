"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { LandingDropzone } from "./dropzone"
import { LandingScoreSample } from "./score-sample"
import { LandingMatchSample } from "./how-it-works"
import { LandingPlanSample } from "./application-plan"

const SAMPLES = [
  { id: "score", label: "Get your Myro Score" },
  { id: "tailor", label: "Tailor and apply" },
] as const

type SampleId = (typeof SAMPLES)[number]["id"]

export function LandingCvHub({
  companyNames,
  companiesMonitored,
}: {
  companyNames: string[]
  companiesMonitored: number
}) {
  const [sample, setSample] = useState<SampleId>("score")
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
    <section className="lp-hub" id="cv-hub" aria-label="CV Hub">
      <div className="lp-hub-drop">
        <LandingDropzone variant="stage" source="landing_dropzone_hero">
          <Link className="lp-dz-alt" href="/market">
            Browse jobs instead <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </LandingDropzone>
      </div>

      <div role="tablist" aria-label="What you get after you upload" className="lp-hub-tabs">
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
        id="lp-hub-panel-score"
        aria-labelledby="lp-hub-tab-score"
        hidden={sample !== "score"}
        className="lp-hub-panel"
      >
        <LandingScoreSample />
      </div>

      <div
        role="tabpanel"
        id="lp-hub-panel-tailor"
        aria-labelledby="lp-hub-tab-tailor"
        hidden={sample !== "tailor"}
        className="lp-hub-panel lp-hub-tailor"
      >
        <LandingMatchSample
          companyNames={companyNames}
          companiesMonitored={companiesMonitored}
        />
        <LandingPlanSample />
      </div>
    </section>
  )
}
