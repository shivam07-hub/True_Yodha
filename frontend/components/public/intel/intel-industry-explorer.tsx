"use client"

import type { NameCountItem } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { cn } from "@/lib/utils"
import "./intel-industry-explorer.css"

interface IntelIndustryExplorerProps {
  industries: NameCountItem[]
  activeIndustry: string | null
  isLoading: boolean
  onSelect: (industry: string) => void
}

export function IntelIndustryExplorer({
  industries,
  activeIndustry,
  isLoading,
  onSelect,
}: IntelIndustryExplorerProps) {
  return (
    <section className="tm-industry-explorer" aria-labelledby="industry-explorer-title">
      <div className="tm-industry-explorer-head">
        <div>
          <h2 id="industry-explorer-title">Explore jobs by industry</h2>
          <p>Pick an industry to see the live role families hiring inside it.</p>
        </div>
        <span>{industries.length ? `${industries.length} industries` : "Live market"}</span>
      </div>

      <div className="tm-industry-chips" aria-label="Industries with live jobs">
        {isLoading && !industries.length ? (
          Array.from({ length: 6 }, (_, index) => (
            <span className="tm-industry-chip-skeleton" key={index} aria-hidden="true" />
          ))
        ) : industries.length ? (
          industries.map((industry) => (
            <button
              type="button"
              className={cn("tm-industry-chip", activeIndustry === industry.name && "is-active")}
              aria-pressed={activeIndustry === industry.name}
              onClick={() => onSelect(industry.name)}
              key={industry.name}
            >
              <span>{industry.name}</span>
              <b>{formatCount(industry.count)}</b>
            </button>
          ))
        ) : (
          <p className="tm-industry-empty">Industry data is unavailable. Search live roles above.</p>
        )}
      </div>
    </section>
  )
}
