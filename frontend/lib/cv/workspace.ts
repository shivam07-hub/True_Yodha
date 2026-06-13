import { APPLICATION_STAGES } from "@/lib/api"
import type { ApplicationResponse, CVVersion } from "@/lib/api"

const ACTIVE_APPLICATION_STATUSES = new Set(["applied", "screening", "interviewing", "final_round"])
// Same predicate the company folders group on, so the COMPANIES stat and the
// folder count are the same number by construction (no "6 vs 13" contradiction).
const TRACKED_STATUSES = new Set<string>(APPLICATION_STAGES)

export interface CVWorkspaceStat {
  key: "tailored" | "companies" | "pipeline"
  eyebrow: string
  value: number | string
  sub: string
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
  const trackedCompanies = new Set(
    applications
      .filter((application) => TRACKED_STATUSES.has(application.status))
      .map((application) => application.company ?? "Unknown"),
  ).size
  const pipelineCount = applications.filter((application) =>
    ACTIVE_APPLICATION_STATUSES.has(application.status),
  ).length

  return [
    { key: "tailored", eyebrow: "TAILORED", value: tailoredCount, sub: "saved copies", interactive: false },
    { key: "companies", eyebrow: "COMPANIES", value: trackedCompanies, sub: "tracked", interactive: false },
    { key: "pipeline", eyebrow: "PIPELINE", value: pipelineCount, sub: "active apps", interactive: false },
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
