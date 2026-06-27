export const INTEL_SEARCH_PARAM = "search"

const JOB_SEARCH_EXAMPLES = [
  "Product roles in Bangalore",
  "Remote data analyst jobs",
  "Frontend engineer, Pune",
] as const

export function normalizeJobSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function buildIntelSearchHref(value: string): string {
  const query = normalizeJobSearchQuery(value)
  if (!query) return "/intel"
  const params = new URLSearchParams({ [INTEL_SEARCH_PARAM]: query })
  return `/intel?${params.toString()}`
}

export function initialJobSearchValue(params: Pick<URLSearchParams, "get">): string {
  return normalizeJobSearchQuery(params.get(INTEL_SEARCH_PARAM) ?? "")
}

export function getJobSearchExamples(): string[] {
  return [...JOB_SEARCH_EXAMPLES]
}
