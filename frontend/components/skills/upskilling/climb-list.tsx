/* "Your climb" — filter tabs (All / On CV / Gaps / Hot) + the sorted row
   list. Replaces the old SkillList (Quick-wins/Hottest sort toggle). */

"use client"

import { useState, type JSX } from "react"
import type { DemandBand } from "@/lib/api"
import { ClimbRow } from "./climb-row"
import type { LadderSkill } from "./types"

const isHot = (d: DemandBand): boolean => d === "very_high" || d === "high"

type FilterKey = "all" | "oncv" | "gaps" | "hot"

const TABS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "oncv", label: "On CV" },
  { key: "gaps", label: "Gaps" },
  { key: "hot", label: "Hot" },
]

function sortSkills(skills: LadderSkill[]): LadderSkill[] {
  return [...skills].sort((a, b) => {
    if (a.onCV !== b.onCV) return a.onCV ? -1 : 1
    return a.clearedLevel - b.clearedLevel
  })
}

export function ClimbList({
  skills,
  onStart,
}: {
  skills: LadderSkill[]
  onStart: (skill: LadderSkill, level: number) => void
}): JSX.Element {
  const [filter, setFilter] = useState<FilterKey>("all")

  const counts: Record<FilterKey, number> = {
    all: skills.length,
    oncv: skills.filter((s) => s.onCV).length,
    gaps: skills.filter((s) => !s.onCV).length,
    hot: skills.filter((s) => isHot(s.demand)).length,
  }

  const filtered = skills.filter((s) => {
    if (filter === "oncv") return s.onCV
    if (filter === "gaps") return !s.onCV
    if (filter === "hot") return isHot(s.demand)
    return true
  })
  const rows = sortSkills(filtered)

  return (
    <section className="up-climb" aria-label="Your climb">
      <div className="up-climb-head">
        <div>
          <h2 className="up-climb-title">Your climb</h2>
          <p className="up-climb-sub">
            Pick a skill, climb the rungs. <span className="up-dot up-dot-banked" aria-hidden />banked · <span className="up-dot up-dot-next" aria-hidden />next move.
          </p>
        </div>
        <div className="up-climb-tabs" role="group" aria-label="Filter skills">
          {TABS.map((t) => (
            <button
              key={t.key} type="button" className="up-climb-tab"
              aria-pressed={filter === t.key} onClick={() => setFilter(t.key)}
            >
              {t.label}<span className="n">{counts[t.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="up-climb-rows">
        {rows.map((s) => <ClimbRow key={s.key} skill={s} onStart={onStart} />)}
      </div>

      <p className="up-foot-note">
        Coins land only on a clear, only the first time per rung. 10/10 = +50 · 9/10 = +30 · 8/10 = +20.
      </p>
    </section>
  )
}
