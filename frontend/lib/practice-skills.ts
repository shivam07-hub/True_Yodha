import type {
  DemandBand,
  SkillGapResponse,
  UserSkillDemandResponse,
  UserSkillItem,
  UserSkillsByDomain,
} from "@/lib/api"

/**
 * Practice-page skill model (owned-first, gaps absorb).
 *
 * Two kinds of skill share the Practice list and need different depth:
 *  - OWNED  — already on the CV (a `UserSkillItem` with `key` + `evidence_text`).
 *             Mounts the rich `InlineSkillCard` (CV-pointer edit / polish / appeal).
 *  - GAP    — demanded by a target job but NOT on the CV (level 0, no evidence).
 *             Mounts the lighter "acquire" card (why it matters + Add to CV).
 *
 * We start from `users.mySkills` so every owned skill appears, then let
 * job-gap and skill-demand data ENRICH the matching owned row (job context).
 * Only demanded skills with no owned match become standalone gap rows — so a
 * skill that is both on the CV and a job gap shows once, in the owned group.
 */

export interface OwnedPracticeSkill {
  item: UserSkillItem
  domain: string
  targetLevel: number
  sources: string[]
  jobCount: number
  demand: number
  demandBand: DemandBand
}

export interface GapPracticeSkill {
  skill_name: string
  levelTo: number
  sources: string[]
  jobCount: number
  demand: number
  demandBand: DemandBand
  company: string | null
}

export interface PracticeSkills {
  owned: OwnedPracticeSkill[]
  gaps: GapPracticeSkill[]
}

const norm = (value: string): string => value.trim().toLowerCase()

export function buildPracticeSkills(
  userSkills: UserSkillsByDomain | undefined,
  jobGaps: SkillGapResponse[],
  skillDemand: UserSkillDemandResponse | undefined,
): PracticeSkills {
  // Owned index — keyed by normalised display name AND by taxonomy key, so we
  // can match job gaps (name-only) and demand (key-bearing) against the same rows.
  const ownedByName = new Map<string, OwnedPracticeSkill>()
  const ownedByKey = new Map<string, OwnedPracticeSkill>()

  Object.entries(userSkills?.by_domain ?? {}).forEach(([domain, items]) => {
    items.forEach((item) => {
      const owned: OwnedPracticeSkill = {
        item,
        domain,
        targetLevel: Math.min(item.level + 1, 5),
        sources: [],
        jobCount: 0,
        demand: 0,
        demandBand: "none",
      }
      ownedByName.set(norm(item.display_name), owned)
      if (item.key) ownedByKey.set(item.key, owned)
    })
  })

  const gaps = new Map<string, GapPracticeSkill>()
  function addGap(
    name: string,
    levelTo: number,
    source: string | null,
    company: string | null,
    demand = 0,
    jobCount = 0,
    band: DemandBand = "none",
  ): void {
    const key = norm(name)
    if (!key) return
    const existing = gaps.get(key)
    if (!existing) {
      gaps.set(key, {
        skill_name: name.trim(),
        levelTo: Math.max(1, levelTo),
        sources: source ? [source] : [],
        jobCount,
        demand,
        demandBand: band,
        company,
      })
      return
    }
    existing.levelTo = Math.max(existing.levelTo, levelTo)
    existing.jobCount = Math.max(existing.jobCount, jobCount)
    existing.demand = Math.max(existing.demand, demand)
    if (band !== "none") existing.demandBand = band
    if (source && !existing.sources.includes(source)) existing.sources.push(source)
    if (!existing.company && company) existing.company = company
  }

  // Job gaps — enrich matching owned rows, otherwise spawn a gap row.
  jobGaps.forEach((gap) => {
    const company = gap.company ?? null
    const source = company ? `Job gap · ${company}` : "Job gap"
    gap.skills
      .filter((skill) => skill.missing || skill.user_level < skill.required_level)
      .forEach((skill) => {
        const owned = ownedByName.get(norm(skill.skill))
        if (owned) {
          owned.targetLevel = Math.max(owned.targetLevel, skill.required_level || owned.targetLevel)
          owned.jobCount += 1
          if (!owned.sources.includes(source)) owned.sources.push(source)
        } else {
          addGap(skill.skill, skill.required_level || 1, source, company)
        }
      })
  })

  // Skill demand — these carry the taxonomy key and are usually the user's own
  // skills, so they almost always enrich an owned row.
  skillDemand?.skills
    .filter((skill) => skill.needs_upgrade)
    .forEach((skill) => {
      const owned = ownedByKey.get(skill.skill) ?? ownedByName.get(norm(skill.display_name || skill.skill))
      if (owned) {
        if (skill.target_level) owned.targetLevel = Math.max(owned.targetLevel, skill.target_level)
        owned.demand = Math.max(owned.demand, skill.weighted_demand)
        owned.jobCount = Math.max(owned.jobCount, skill.job_count_30d)
        if (skill.demand_band && skill.demand_band !== "none") owned.demandBand = skill.demand_band
        if (!owned.sources.includes("Target upgrade")) owned.sources.push("Target upgrade")
      } else {
        addGap(skill.display_name || skill.skill, skill.target_level ?? 1, "Target upgrade", null, skill.weighted_demand, skill.job_count_30d, skill.demand_band ?? "none")
      }
    })

  const owned = Array.from(ownedByName.values()).sort((a, b) => {
    if (a.item.level !== b.item.level) return a.item.level - b.item.level
    if (a.jobCount !== b.jobCount) return b.jobCount - a.jobCount
    return a.item.display_name.localeCompare(b.item.display_name)
  })
  const gapList = Array.from(gaps.values()).sort((a, b) => {
    if (a.jobCount !== b.jobCount) return b.jobCount - a.jobCount
    if (a.demand !== b.demand) return b.demand - a.demand
    return a.skill_name.localeCompare(b.skill_name)
  })

  return { owned, gaps: gapList }
}
