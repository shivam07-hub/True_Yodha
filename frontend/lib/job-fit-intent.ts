export type FitBand = "strong" | "building" | "gap"

export function fitBand(score: number): FitBand {
  if (score >= 70) return "strong"
  if (score >= 40) return "building"
  return "gap"
}

export function jobFitNextPath(input: {
  jobId: string | null | undefined
  hasReplayableCv: boolean
}): string {
  const jobId = (input.jobId ?? "").trim()
  if (!jobId) return "/cv?upload=1"

  const params = new URLSearchParams()
  if (!input.hasReplayableCv) params.set("upload", "1")
  params.set("jobId", jobId)
  return `/cv?${params.toString()}`
}
