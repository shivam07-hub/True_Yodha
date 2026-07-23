import type { ScoreResponse, UserSkillItem, UserSkillsByDomain } from "@/lib/api"
import { ALL_SCORE_DOMAINS } from "@/lib/domain-labels"

export interface ScoreMapAxis {
  domain: string
  score: number
  ratio: number
  skills: UserSkillItem[]
  evidenceCount: number
}

export interface ScoreMapMove {
  skill: string
  gain: number
  jobs: number
  domain: string
}

export interface ScoreMapModel {
  totalScore: number
  axes: ScoreMapAxis[]
  selected: ScoreMapAxis | null
  topMove: ScoreMapMove | null
  /**
   * Set when the URL names a real taxonomy domain that has no evidence yet
   * (Q7: uncounted domains are selectable doors, not dead chips). Mutually
   * exclusive with `selected` — an explicit request for an unevidenced domain
   * is honoured as-is, never silently redirected to the default axis.
   */
  selectedEmptyDomain: string | null
}

interface ScoreMapLocation {
  panel?: "why"
  domain?: string | null
  skill?: string | null
}

function appendContext(params: URLSearchParams, location: ScoreMapLocation): void {
  if (location.panel) params.set("panel", location.panel)
  if (location.domain) params.set("domain", location.domain)
  if (location.skill) params.set("skill", location.skill)
}

export function buildScoreMapHref(location: ScoreMapLocation = {}): string {
  const params = new URLSearchParams()
  appendContext(params, location)
  const query = params.toString()
  return `/skills${query ? `?${query}` : ""}`
}

export function buildCvEvidenceHref(location: Pick<ScoreMapLocation, "domain" | "skill">): string {
  const params = new URLSearchParams({ edit: "1", tab: "skills", from: "score-map" })
  appendContext(params, location)
  return `/cv?${params.toString()}`
}

/**
 * One presentation model for the Myro Score and its radar. The radar never
 * recomputes a second score from raw skill levels; every axis is the persisted
 * domain score that the canonical backend averaged into `total_score`.
 */
/**
 * The domain the page opens on when the URL names none.
 *
 * Not the lowest score — that is almost always a thin-evidence domain (one
 * detected skill), so it is the least informative axis AND leads with the
 * user's worst number on a page meant to make the score legible, not indict.
 * Instead open where the points actually are: the domain holding the biggest
 * real lever (highest score_delta gap). Absent any lever ≥1pt, lead with the
 * strongest domain — the edge, not the wound.
 */
function norm(value: string): string {
  return value.trim().toLowerCase()
}

function defaultAxis(axes: ScoreMapAxis[], gapSkills: ScoreResponse["gap_skills"]): ScoreMapAxis | undefined {
  if (axes.length === 0) return undefined
  const byDomain = new Map(axes.map((axis) => [axis.domain, axis]))
  const bestLever = [...gapSkills]
    .filter((g) => (g.score_delta ?? 0) >= 1 && g.domain && byDomain.has(g.domain))
    .sort((a, b) => (b.score_delta ?? 0) - (a.score_delta ?? 0))[0]
  if (bestLever?.domain) return byDomain.get(bestLever.domain)
  return [...axes].sort((a, b) => b.score - a.score)[0]
}

export function buildScoreMap(
  score: ScoreResponse,
  skills: UserSkillsByDomain,
  requestedDomain?: string | null,
): ScoreMapModel {
  const axes = Object.entries(score.domain_scores).map(([domain, raw]) => {
    const value = Math.min(100, Math.max(0, Math.round(raw)))
    const domainSkills = skills.by_domain[domain] ?? []
    return {
      domain,
      score: value,
      ratio: value / 100,
      skills: domainSkills,
      evidenceCount: domainSkills.filter((skill) => Boolean(skill.evidence_text?.trim())).length,
    }
  })
  const requestedAxis = axes.find((axis) => axis.domain === requestedDomain)
  // Store the canonical catalogue name, never the raw URL value — same
  // convention as placeSkill/domainClusterCount, so a case/whitespace variant
  // in the URL still resolves to the one real domain string everywhere else
  // on the page reads (radar highlight, breakdown active chip, CV deep-link).
  const matchedEmptyDomain = !requestedAxis && requestedDomain
    ? ALL_SCORE_DOMAINS.find((name) => norm(name) === norm(requestedDomain)) ?? null
    : null
  const selected = requestedAxis
    ?? (matchedEmptyDomain ? null : defaultAxis(axes, score.gap_skills))
    ?? null
  const selectedEmptyDomain = matchedEmptyDomain
  const gap = score.gap_skills
    .filter((item) => item.domain === selected?.domain && (item.score_delta ?? 0) >= 1)
    .sort((a, b) =>
      (b.score_delta ?? 0) - (a.score_delta ?? 0)
      || b.gap_score - a.gap_score
      || b.job_count_30d - a.job_count_30d
    )[0]

  return {
    totalScore: Math.round(score.total_score),
    axes,
    selected,
    selectedEmptyDomain,
    topMove: gap && selected
      ? {
          skill: gap.skill,
          gain: Math.round(gap.score_delta ?? 0),
          jobs: gap.job_count_30d,
          domain: selected.domain,
        }
      : null,
  }
}
