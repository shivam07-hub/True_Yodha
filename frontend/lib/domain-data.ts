import type { QueryClient } from "@tanstack/react-query"

type JobId = string | null | undefined

export const dataKeys = {
  profile: () => ["profile"] as const,
  onboarding: () => ["onboarding"] as const,
  onboardingResult: () => ["onboarding", "result"] as const,
  roleStanding: () => ["skills", "role-standing"] as const,
  scores: () => ["scores"] as const,
  scoreMap: (token: string | null | undefined) => ["score-map-bootstrap", token ?? ""] as const,
  userSkills: () => ["user-skills"] as const,
  practiceSaves: () => ["practice-saves"] as const,
  skillUpvotes: () => ["skill-upvotes"] as const,
  jobs: () => ["jobs"] as const,
  hiddenJobs: () => ["jobs", "hidden"] as const,
  feedState: () => ["jobs", "feed-state"] as const,
  jobPulses: (jobIds: string[]) => ["jobs", "pulses", jobIds] as const,
  jobContributions: () => ["jobs", "contributions"] as const,
  applications: () => ["applications"] as const,
  /** The Collection Record — the Collections surface's ONE query key
   *  (CONTEXT.md). Every mutation writes the server's response back into it. */
  collection: () => ["collection"] as const,
  staleApplications: () => ["stale-applications"] as const,
  notificationsUnread: () => ["notifications", "unread"] as const,
  notifications: () => ["notifications", "list"] as const,
  userSkillDemand: () => ["user-skill-demand"] as const,
  diary: () => ["diary"] as const,
  milestones: () => ["milestones"] as const,
  cvEvidence: () => ["cv-evidence"] as const,
  cvStructured: () => ["cv-structured"] as const,
  cvVersions: (jobId: JobId) => ["cv-versions", jobId ?? "all"] as const,
  careerSkillPath: () => ["career-skill-path"] as const,
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
  queryClient.invalidateQueries({ queryKey: ["score-map-bootstrap"] })
}

/** Invalidate the complete Score & Skills read model after evidence changes. */
export function invalidateScoreMapData(queryClient: QueryClient): void {
  invalidateScoreData(queryClient)
  queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
  queryClient.invalidateQueries({ queryKey: dataKeys.userSkillDemand() })
}

export function invalidateCvData(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
  queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence() })
  invalidateScoreMapData(queryClient)
  // A new CV re-scores every job → the market feed + the brain's ranked shortlist
  // are both stale. Invalidate so the next /market visit re-warms and re-ranks.
  queryClient.invalidateQueries({ queryKey: ["jobFeed"] })
  queryClient.invalidateQueries({ queryKey: ["jobFeedWarm"] })
}

/**
 * Target-role edit (issue #145) changes the role that drives BOTH the Myro
 * Score and the job feed, so a role write must refresh every role-dependent
 * read: profile (the role label), the score, skills/demand, and the job feed +
 * its analytics. Partial keys invalidate every query under that prefix.
 */
export function invalidateTargetRoleData(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
  queryClient.invalidateQueries({ queryKey: dataKeys.roleStanding() })
  queryClient.invalidateQueries({ queryKey: dataKeys.careerSkillPath() })
  invalidateScoreMapData(queryClient)
  queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
  queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
  queryClient.invalidateQueries({ queryKey: ["jobs-analytics-me"] })
  // The role change also changes the /market feed AND the brain's shortlist. The
  // market feed is a SEPARATE query family (["jobFeed"] / ["jobFeedWarm"]), NOT
  // dataKeys.jobs() — invalidate both so the cards actually re-rank, not just the
  // rail. (The Delta-4 "Tell Myro" apply is the path that used to update only the
  // rail because this was missing.)
  queryClient.invalidateQueries({ queryKey: ["jobFeed"] })
  queryClient.invalidateQueries({ queryKey: ["jobFeedWarm"] })
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
