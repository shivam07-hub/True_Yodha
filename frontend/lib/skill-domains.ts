/**
 * Domain-level rollups for the Skill Intelligence surface (Practice page).
 *
 * Extracted from the old /skills page when it was absorbed into Practice as
 * peer-tabs. Single source for the domain-average math the header stat tiles,
 * the radar Map tab, and the "below 40%" jump all read.
 */

import type { UserSkillItem, UserSkillsByDomain } from "@/lib/api"

export interface DomainEntry {
  domain: string
  items: UserSkillItem[]
  /** 0–100 average proficiency across the domain's skills. */
  avg: number
}

export type DomainStatus = "at-risk" | "building" | "strong"

/** 0–100 mean of a domain's skill levels (L0–L5 → ×20). */
export function domainAvg(items: { level: number }[]): number {
  if (!items.length) return 0
  return Math.round((items.reduce((s, it) => s + it.level, 0) / items.length) * 20)
}

export function domainStatus(avg: number): DomainStatus {
  if (avg < 40) return "at-risk"
  if (avg < 70) return "building"
  return "strong"
}

export function buildDomainEntries(skills: UserSkillsByDomain): DomainEntry[] {
  return Object.entries(skills.by_domain).map(([domain, items]) => ({
    domain,
    items: items as UserSkillItem[],
    avg: domainAvg(items as { level: number }[]),
  }))
}

export interface SkillIntelStats {
  domainCount: number
  totalSkills: number
  needProofCount: number
  weakDomainCount: number
}

export function skillIntelStats(skills: UserSkillsByDomain, entries: DomainEntry[]): SkillIntelStats {
  const allSkills = Object.values(skills.by_domain).flat()
  const proofCount = allSkills.filter((s) => s.evidence_text).length
  return {
    domainCount: entries.length,
    totalSkills: allSkills.length,
    needProofCount: Math.max(0, allSkills.length - proofCount),
    weakDomainCount: entries.filter((d) => d.avg < 40).length,
  }
}
