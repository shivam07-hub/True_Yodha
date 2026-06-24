import type { GapSkill } from "@/lib/api"
import { DOMAIN_LABELS, domainLabel } from "@/lib/domain-labels"

/**
 * Personal Myro Score decomposition (T2-3 Part A) — turns the user's own score
 * into the credit-score-style answer to "why is MY number this, and how do I
 * move it." Pure + deterministic so the model is testable apart from the view.
 *
 * The score is the mean of the domains the CV has evidence in (absent domains
 * are not counted). So the honest decomposition is: your evidenced domains (the
 * factors that ARE averaged), each with its biggest real lever where one exists,
 * plus the uncounted domains as a separate opportunity tier — never with a
 * fabricated point-gain.
 */

export type DomainBand = "strong" | "building" | "weak"

export interface DomainLever {
  skill: string
  /** Honest projected whole-point gain from practising it one level (score_delta). */
  gain: number
}

export interface DomainRow {
  code: string
  label: string
  /** 0–100, rounded. */
  score: number
  band: DomainBand
  /** Highest-impact real move in this domain, or null when none reaches +1 pt. */
  lever: DomainLever | null
}

export interface EmptyDomain {
  code: string
  label: string
}

export interface ScoreBreakdown {
  score: number
  evidencedCount: number
  emptyCount: number
  /** Evidenced domains, strongest first — the factors your score averages. */
  domains: DomainRow[]
  /** Domains with no evidence yet — counted neither for nor against you. */
  emptyDomains: EmptyDomain[]
}

function band(score: number): DomainBand {
  if (score >= 60) return "strong"
  if (score >= 40) return "building"
  return "weak"
}

function bestLever(code: string, gapSkills: GapSkill[]): DomainLever | null {
  let best: DomainLever | null = null
  for (const g of gapSkills) {
    if (g.domain !== code) continue
    const gain = g.score_delta ?? 0
    if (gain < 1) continue
    const rounded = Math.round(gain)
    if (best === null || rounded > best.gain) best = { skill: g.skill, gain: rounded }
  }
  return best
}

export function buildScoreBreakdown(
  score: number,
  domainScores: Record<string, number>,
  gapSkills: GapSkill[],
): ScoreBreakdown {
  const evidenced = Object.entries(domainScores).filter(([, v]) => typeof v === "number")

  const domains: DomainRow[] = evidenced
    .map(([code, raw]) => {
      const value = Math.round(raw)
      return { code, label: domainLabel(code), score: value, band: band(value), lever: bestLever(code, gapSkills) }
    })
    .sort((a, b) => b.score - a.score)

  const evidencedCodes = new Set(domains.map((d) => d.code))
  const emptyDomains: EmptyDomain[] = Object.keys(DOMAIN_LABELS)
    .filter((code) => !evidencedCodes.has(code))
    .map((code) => ({ code, label: domainLabel(code) }))

  return {
    score,
    evidencedCount: domains.length,
    emptyCount: emptyDomains.length,
    domains,
    emptyDomains,
  }
}
