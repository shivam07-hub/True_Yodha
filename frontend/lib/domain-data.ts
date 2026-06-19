import type { QueryClient } from "@tanstack/react-query"

type JobId = string | null | undefined

export const dataKeys = {
  profile: () => ["profile"] as const,
  onboarding: () => ["onboarding"] as const,
  onboardingResult: () => ["onboarding", "result"] as const,
  scores: () => ["scores"] as const,
  userSkills: () => ["user-skills"] as const,
  jobs: () => ["jobs"] as const,
  hiddenJobs: () => ["jobs", "hidden"] as const,
  feedState: () => ["jobs", "feed-state"] as const,
  jobPulses: (jobIds: string[]) => ["jobs", "pulses", jobIds] as const,
  applications: () => ["applications"] as const,
  staleApplications: () => ["stale-applications"] as const,
  userSkillDemand: () => ["user-skill-demand"] as const,
  diary: () => ["diary"] as const,
  milestones: () => ["milestones"] as const,
  cvEvidence: () => ["cv-evidence"] as const,
  cvStructured: () => ["cv-structured"] as const,
  cvVersions: (jobId: JobId) => ["cv-versions", jobId ?? "all"] as const,
  jobPath: (jobId: JobId) => ["job-path", jobId] as const,
  skillGap: (jobId: JobId) => ["skill-gap", jobId] as const,
  deepenings: (jobId: JobId) => ["deepenings", jobId] as const,
  growthCommand: () => ["growth-command"] as const,
  betaAssignment: () => ["feedback", "beta-assignment"] as const,
  jobsAnalytics: (
    roleDomain?: string | null,
    locationCity?: string | null,
    locationCountry?: string | null,
    locationMode?: string | null,
  ) => ["jobs-analytics", roleDomain ?? "", locationCity ?? "", locationCountry ?? "", locationMode ?? ""] as const,
  jobsAnalyticsPublic: (
    roleDomain?: string | null,
    locationCity?: string | null,
    locationCountry?: string | null,
    locationMode?: string | null,
  ) => ["jobs-analytics-public", roleDomain ?? "", locationCity ?? "", locationCountry ?? "", locationMode ?? ""] as const,
  jobsAnalyticsMe: (
    cluster?: string | null,
    locationCity?: string | null,
    locationCountry?: string | null,
    locationMode?: string | null,
  ) => ["jobs-analytics-me", cluster ?? "", locationCity ?? "", locationCountry ?? "", locationMode ?? ""] as const,
  jobsAtCompany: (company: string | null | undefined, limit: number) =>
    ["jobs-at-company", company ?? "", limit] as const,
  topCompaniesAt: (kind: string | null | undefined, name: string | null | undefined) =>
    ["top-companies-at", kind ?? "", name ?? ""] as const,
  globalJobSearch: (q: string | null | undefined, limit: number) =>
    ["global-job-search", (q ?? "").toLowerCase().trim(), limit] as const,
  entitySkills: (
    entity: string | null | undefined,
    type: string | null | undefined,
    locationCity?: string | null,
    locationCountry?: string | null,
    locationMode?: string | null,
  ) => ["entity-skills", entity ?? "", type ?? "", locationCity ?? "", locationCountry ?? "", locationMode ?? ""] as const,
  jobsSearch: (
    company: string | null | undefined,
    roleDomain?: string | null,
    skill?: string | null,
    locationCity?: string | null,
    locationCountry?: string | null,
    locationMode?: string | null,
    page?: number | null,
    pageSize?: number | null,
  ) => [
    "jobs-search",
    company ?? "",
    roleDomain ?? "",
    skill ?? "",
    locationCity ?? "",
    locationCountry ?? "",
    locationMode ?? "",
    page ?? 1,
    pageSize ?? 50,
  ] as const,
}

export function invalidateScoreData(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
}

export function invalidateCvData(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
  queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
  queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence() })
  queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
  invalidateScoreData(queryClient)
}

export function invalidateJobData(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
  queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
}

export function invalidateJobPathData(queryClient: QueryClient, jobId: JobId): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.jobPath(jobId) })
}

export function invalidateDiaryData(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.diary() })
  queryClient.invalidateQueries({ queryKey: dataKeys.milestones() })
  invalidateScoreData(queryClient)
  queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence() })
}
