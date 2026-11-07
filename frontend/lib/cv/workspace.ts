import { APPLICATION_STAGES } from "@/lib/api"
import type { ApplicationResponse, CVVersion } from "@/lib/api"

const ACTIVE_APPLICATION_STATUSES = new Set(["applied", "interviewing"])
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

/**
 * The CV an application freezes when the person says they sent it — the same
 * pick as the backend's `cv_of_record._pick_version`: a version tailored for
 * this job, else the newest CV they have. `latestCVVersionForJob` is the first
 * half alone (null when nothing is tailored); this never leaves them guessing
 * which CV went.
 */
export function cvOfRecordFor(jobId: string, versions: CVVersion[]): CVVersion | null {
  const tailored = latestCVVersionForJob(jobId, versions)
  if (tailored) return tailored
  if (versions.length === 0) return null
  return [...versions].sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : b.id - a.id))[0]
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
  // Best fit first — the heart used to break this tie and was never once used.
  const untailored = applications
    .filter((application) => application.job_id && !latestCVVersionForJob(application.job_id, versions))
    .sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1))[0]
  return untailored?.job_id ?? applications[0]?.job_id ?? null
}
