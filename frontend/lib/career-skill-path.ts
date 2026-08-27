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
  role_family_label: string | null
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

export interface CareerSkillPath {
  needs_target: boolean
  snapshot: CareerTargetSnapshot | null
  lower: BandSkillMap | null
  anchor: BandSkillMap | null
  higher: BandSkillMap | null
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
