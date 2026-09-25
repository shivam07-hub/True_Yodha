import { backendRequest } from "@/lib/api"
import type { OnboardingResult } from "@/lib/api"

export type SourceSeniority = "intern" | "entry" | "mid" | "senior" | "lead" | "executive"
export type SkillState = "on_cv" | "practised" | "not_evidenced"
export type DemandKind = "core" | "neighbor"
export type CertificateStatus = "none" | "issued" | "on_cv"

export const SENIORITY_LABEL: Record<SourceSeniority, string> = {
  intern: "Internship",
  entry: "Entry-level",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
  executive: "Executive",
}

export interface CareerTargetSnapshot {
  id: string
  role_title: string
  career_area: string | null
  role_family: string
  seniority: SourceSeniority
  locations: string[]
  cv_baseline_id: number | null
  created_at: string | null
}

export interface DemandMeter {
  kind: DemandKind
  skill_job_count: number
  band_job_count: number
}

export interface SkillPathCard {
  skill_id: number | null
  taxonomy_key: string
  display_name: string
  state: SkillState
  current_level: number | null
  required_level: number | null
  evidence_pointer: string | null
  demand: DemandMeter | null
  ladder_complete: boolean
  certificate_status: CertificateStatus
  verification_id: string | null
  next_practice_level: number | null
  request_status: "none" | "recorded" | "fulfilled"
}

export interface BandSkillMap {
  kind: "lower" | "anchor" | "higher"
  seniority: SourceSeniority
  job_count: number | null
  cards: SkillPathCard[]
}

export type LearningRepoUseCase =
  | "role_path"
  | "language"
  | "framework"
  | "data_infrastructure"
  | "practice"
  | "ai_tooling"

export interface LearningRepoLink {
  full_name: string
  html_url: string
  roadmap_slug: string
  use_case: LearningRepoUseCase
  taxonomy_key: string
}

const LEARNING_REPO_GROUPS: { useCase: LearningRepoUseCase; label: string }[] = [
  { useCase: "role_path", label: "Role" },
  { useCase: "language", label: "Language" },
  { useCase: "framework", label: "Framework" },
  { useCase: "data_infrastructure", label: "Data" },
  { useCase: "practice", label: "Practice" },
  { useCase: "ai_tooling", label: "AI" },
]

export function groupLearningRepos(
  repos: readonly LearningRepoLink[],
): { useCase: LearningRepoUseCase; label: string; repos: LearningRepoLink[] }[] {
  return LEARNING_REPO_GROUPS.flatMap((group) => {
    const items = repos.filter((repo) => repo.use_case === group.useCase)
    return items.length === 0 ? [] : [{ ...group, repos: items }]
  })
}

export interface CareerSkillPath {
  needs_target: boolean
  snapshot: CareerTargetSnapshot | null
  lower: BandSkillMap | null
  anchor: BandSkillMap | null
  higher: BandSkillMap | null
  learning_repos?: LearningRepoLink[]
  next_action: {
    kind: string
    label: string
    taxonomy_key?: string | null
    skill_id?: number | null
    level?: number | null
    verification_id?: string | null
  } | null
  target_flow: OnboardingResult | null
}

export interface SkillCertificatePublic {
  skill_display_name: string
  achieved_level: number
  passed_at: string
  verification_id: string
  assessment_edition: string
}

export function certificateCvLine(cert: SkillCertificatePublic): string {
  return (
    `Myro Skill Certificate · ${cert.skill_display_name} · ` +
    `Level ${cert.achieved_level} · ${cert.passed_at.slice(0, 10)} · ${cert.verification_id}`
  )
}

export function addCertificateHref(verificationId: string): string {
  return `/cv?edit=1&addCert=${encodeURIComponent(verificationId)}`
}

/** Prep rail: gaps first, then evidenced, original order inside each group. */
export function sortAnchorCards(cards: readonly SkillPathCard[]): SkillPathCard[] {
  return [...cards].sort((a, b) => {
    const gapA = a.state === "not_evidenced" ? 0 : 1
    const gapB = b.state === "not_evidenced" ? 0 : 1
    return gapA - gapB
  })
}

/** A path the user can act on now: practise, or add a certificate to the CV. */
export function isLivePath(card: SkillPathCard): boolean {
  if (card.certificate_status === "issued" && card.verification_id) return true
  if (card.ladder_complete && card.next_practice_level) return true
  return card.request_status === "fulfilled"
}

/** Your band, then the lower neighbour, then the next. Missing bands stay out. */
export function storyBands(path: CareerSkillPath): BandSkillMap[] {
  return [path.anchor, path.lower, path.higher].filter(
    (map): map is BandSkillMap => map != null,
  )
}

/** Live paths first; demand order from the server is kept inside each group. */
export function sortStoryCards(cards: readonly SkillPathCard[]): SkillPathCard[] {
  return [...cards].sort((a, b) => {
    const liveA = isLivePath(a) ? 0 : 1
    const liveB = isLivePath(b) ? 0 : 1
    return liveA - liveB
  })
}

/**
 * Skills the story already named that we cannot teach yet.
 * Unique by taxonomy key; your band wins when the same skill appears twice.
 */
export function requestQueue(path: CareerSkillPath): SkillPathCard[] {
  const seen = new Set<string>()
  const queued: SkillPathCard[] = []
  for (const map of storyBands(path)) {
    for (const item of map.cards) {
      if (isLivePath(item) || seen.has(item.taxonomy_key)) continue
      seen.add(item.taxonomy_key)
      queued.push(item)
    }
  }
  return queued
}

export const careerSkillPath = {
  get: (token: string) =>
    backendRequest<CareerSkillPath>("/career-skill-path", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  request: (token: string, taxonomyKey: string) =>
    backendRequest<{ taxonomy_key: string; status: string; message: string }>(
      "/career-skill-path/learning-requests",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ taxonomy_key: taxonomyKey }),
      },
    ),
  withdraw: (token: string, taxonomyKey: string) =>
    backendRequest<void>(
      `/career-skill-path/learning-requests/${encodeURIComponent(taxonomyKey)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    ),
  publicCertificate: (verificationId: string) =>
    backendRequest<SkillCertificatePublic>(
      `/public/skill-certificates/${encodeURIComponent(verificationId)}`,
    ),
}
