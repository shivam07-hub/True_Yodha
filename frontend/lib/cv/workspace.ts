import type { ApplicationResponse, CVVersion } from "@/lib/api"

const ACTIVE_APPLICATION_STATUSES = new Set(["applied", "screening", "interviewing", "final_round"])

export interface CVWorkspaceStat {
  key: "tailored" | "companies" | "pipeline" | "downloads"
  eyebrow: string
  value: number | string
  sub: string
  accent?: boolean
  interactive: false
}

export interface CVWorkspaceAction {
  label: string
  tone: "primary" | "secondary"
}

export function latestCVVersionForJob(jobId: string, versions: CVVersion[]): CVVersion | null {
  const matches = versions.filter((version) => version.job_id === jobId && version.kind !== "baseline_upload")
  if (matches.length === 0) return null
  return matches.sort((a, b) => b.user_version_number - a.user_version_number)[0]
}

export function buildCVWorkspaceStats(
  versions: CVVersion[],
  applications: ApplicationResponse[],
): CVWorkspaceStat[] {
  const tailoredCount = versions.filter((version) => version.kind !== "baseline_upload").length
  const companiesWithCv = new Set(
    versions
      .filter((version) => version.kind !== "baseline_upload" && version.company_name)
      .map((version) => version.company_name),
  ).size
  const pipelineCount = applications.filter((application) =>
    ACTIVE_APPLICATION_STATUSES.has(application.status),
  ).length

  return [
    { key: "tailored", eyebrow: "TAILORED", value: tailoredCount, sub: "saved copies", accent: true, interactive: false },
    { key: "companies", eyebrow: "COMPANIES", value: companiesWithCv, sub: "with CVs", interactive: false },
    { key: "pipeline", eyebrow: "PIPELINE", value: pipelineCount, sub: "active apps", interactive: false },
    { key: "downloads", eyebrow: "DOWNLOADS", value: "—", sub: "tracking pending", interactive: false },
  ]
}

export function getJobWorkspaceAction(cv: CVVersion | null): CVWorkspaceAction {
  if (!cv) return { label: "Create tailored CV", tone: "primary" }
  return { label: "Open latest CV", tone: "primary" }
}

export function pickNewCvJobId(applications: ApplicationResponse[], versions: CVVersion[]): string | null {
  const untailored = applications.find((application) =>
    application.job_id && !latestCVVersionForJob(application.job_id, versions),
  )
  return untailored?.job_id ?? applications[0]?.job_id ?? null
}
