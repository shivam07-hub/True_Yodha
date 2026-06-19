import type { JobMatch } from "@/lib/api"

const CREDIBLE_VERDICTS = new Set(["apply", "negotiate"])

export function isCredibleRecommendation(job: JobMatch): boolean {
  return job.is_recommended === true
    && typeof job.overall_score === "number"
    && job.overall_score >= 3.5
    && CREDIBLE_VERDICTS.has(job.recommendation?.trim().toLocaleLowerCase() ?? "")
    && job.seniority_compatibility === true
    && typeof job.baseline_version_id === "number"
    && Boolean(job.target_context_hash)
}

export function credibleRecommendations(jobs: JobMatch[]): JobMatch[] {
  return jobs.filter(isCredibleRecommendation)
}
