import type { QueryClient } from "@tanstack/react-query"

type Token = string | null | undefined
type JobId = string | null | undefined

export const dataKeys = {
  profile: (token: Token) => ["profile", token] as const,
  scores: (token: Token) => ["scores", token] as const,
  userSkills: (token: Token) => ["user-skills", token] as const,
  jobs: (token: Token) => ["jobs", token] as const,
  applications: (token: Token) => ["applications", token] as const,
  userSkillDemand: (token: Token) => ["user-skill-demand", token] as const,
  diary: (token: Token) => ["diary", token] as const,
  milestones: (token: Token) => ["milestones", token] as const,
  cvProfile: (token: Token) => ["cv-profile", token] as const,
  cvEvidence: (token: Token) => ["cv-evidence", token] as const,
  jobPath: (jobId: JobId, token: Token) => ["job-path", jobId, token] as const,
  skillGap: (jobId: JobId, token: Token) => ["skill-gap", jobId, token] as const,
  jobsAnalytics: (roleDomain?: string | null) => ["jobs-analytics", roleDomain ?? ""] as const,
  jobsAnalyticsPublic: (roleDomain?: string | null) => ["jobs-analytics-public", roleDomain ?? ""] as const,
  jobsAnalyticsMe: (token: Token) => ["jobs-analytics-me", token] as const,
  jobsSearch: (
    company: string | null | undefined,
    roleDomain?: string | null,
    skill?: string | null,
    page?: number | null,
    pageSize?: number | null,
  ) => ["jobs-search", company ?? "", roleDomain ?? "", skill ?? "", page ?? 1, pageSize ?? 50] as const,
}

export function invalidateScoreData(queryClient: QueryClient, token: Token): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.scores(token) })
}

export function invalidateCvData(queryClient: QueryClient, token: Token): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.cvProfile(token) })
  queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence(token) })
  queryClient.invalidateQueries({ queryKey: dataKeys.userSkills(token) })
  invalidateScoreData(queryClient, token)
}

export function invalidateJobData(queryClient: QueryClient, token: Token): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.jobs(token) })
  queryClient.invalidateQueries({ queryKey: dataKeys.applications(token) })
}

export function invalidateJobPathData(queryClient: QueryClient, jobId: JobId, token: Token): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.jobPath(jobId, token) })
}

export function invalidateDiaryData(queryClient: QueryClient, token: Token): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.diary(token) })
  queryClient.invalidateQueries({ queryKey: dataKeys.milestones(token) })
  invalidateScoreData(queryClient, token)
  queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence(token) })
}
