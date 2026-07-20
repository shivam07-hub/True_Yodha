"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { MAX_LEVEL, sessionsToNextLevel } from "@/lib/level-thresholds"

/** A user skill below Strong — a candidate for the gap alert. */
export interface GapSkill {
  name: string
  level: number
  forgeSessions: number
}

export interface GapAlert {
  company: string
  skill: string
  newRoles: number
  level: number
  nextLevel: number
}

/**
 * The /intel gap alert (Signal Thread S3, Zone 3): when a company the user
 * follows posted new roles THIS WEEK for the Gap/Building skill closest to their
 * next level, surface it. One batched read (companies × gap skills), 30-min
 * stale. Returns null when nothing matches — the strip then hides.
 *
 * Selection: rank the user's gap skills by how close they are to levelling
 * (fewest practice sessions remaining first — "closest to your next level"),
 * then take the first such skill a followed company is hiring for this week,
 * picking that company's strongest new-role count.
 */
export function useGapAlert(companyNames: string[], gapSkills: GapSkill[]) {
  const skillNames = useMemo(() => gapSkills.map((s) => s.name), [gapSkills])

  const { data } = useQuery({
    queryKey: ["gapSignals", [...companyNames].sort().join("|"), [...skillNames].sort().join("|")],
    queryFn: () => jobs.companyGapSignals(companyNames, skillNames),
    enabled: companyNames.length > 0 && skillNames.length > 0,
    staleTime: 30 * 60 * 1000,
  })

  const alert = useMemo<GapAlert | null>(() => {
    const signals = data?.signals ?? []
    if (signals.length === 0) return null
    // Best (company, count) per skill — signals arrive sorted desc by new_roles,
    // so the first one seen for a skill is its strongest.
    const bestBySkill = new Map<string, { company: string; newRoles: number }>()
    for (const s of signals) {
      const key = s.skill.toLowerCase()
      if (!bestBySkill.has(key)) bestBySkill.set(key, { company: s.company_name, newRoles: s.new_roles })
    }
    // Gap skills, closest-to-next-level first.
    const ranked = [...gapSkills]
      .filter((s) => s.level < MAX_LEVEL)
      .sort((a, b) => sessionsToNextLevel(a.level, a.forgeSessions) - sessionsToNextLevel(b.level, b.forgeSessions))
    for (const skill of ranked) {
      const hit = bestBySkill.get(skill.name.toLowerCase())
      if (hit) {
        return {
          company: hit.company,
          skill: skill.name,
          newRoles: hit.newRoles,
          level: skill.level,
          nextLevel: Math.min(MAX_LEVEL, skill.level + 1),
        }
      }
    }
    return null
  }, [data, gapSkills])

  return { alert }
}
