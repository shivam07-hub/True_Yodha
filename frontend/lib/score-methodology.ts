export interface PublicScoreDomain {
  short: string
  full: string
}

export const PUBLIC_SCORE_DOMAINS: ReadonlyArray<PublicScoreDomain> = [
  { short: "Tech", full: "Technology and software systems" },
  { short: "Engineering", full: "Engineering and production" },
  { short: "Growth", full: "Marketing, strategy, and business growth" },
  { short: "Sales", full: "Sales and customer work" },
  { short: "Finance", full: "Finance, accounting, and operations" },
  { short: "People", full: "People, leadership, and learning" },
  { short: "Design", full: "Design, product, and user research" },
  { short: "Law", full: "Law, compliance, and policy" },
  { short: "Research", full: "Research, analysis, and science" },
  { short: "Health", full: "Health, care, and life sciences" },
]

// Seniority band → the proficiency level the score measures you against.
// Mirrors backend TARGET_LEVEL_BY_BAND (scoring/formulas.py). The score is
// band-relative: a fresher is measured against what their stage needs, not L5.
export const SCORE_TARGET_LEVEL_BY_BAND: Readonly<Record<string, number>> = {
  intern: 2,
  entry: 2,
  mid: 3,
  senior: 4,
  lead: 5,
  executive: 5,
}
export const DEFAULT_SCORE_TARGET_LEVEL = 2 // entry

// Human label for a seniority band, used in the "top X% for {label}" line.
const BAND_LABELS: Readonly<Record<string, string>> = {
  intern: "internships",
  entry: "entry-level",
  mid: "mid-level",
  senior: "senior",
  lead: "lead",
  executive: "executive",
}

export function bandLabel(band: string | null | undefined): string {
  return BAND_LABELS[(band ?? "").toLowerCase()] ?? "entry-level"
}

export const SCORE_ENGINE_FACTS = {
  backendEntry: "backend/app/services/scoring/orchestrator.py::recompute_score",
  historicalEntry: "compute_and_persist_score was replaced by scoring facades in ADR 0002",
  clusterFormula:
    "min(level/target, 1) * (0.3 + 0.7 * log1p(user skills in cluster) / log1p(total skills in cluster))",
  domainFormula: "skill-count-weighted cluster mean * breadth bonus * 100",
  totalScoreMethod: "mean_of_domains_with_evidence",
} as const

interface WorkedClusterInput {
  userSkillCount: number
  totalClusterSkills: number
  strongestLevel: number
  targetLevel?: number
}

export function workedClusterScore(input: WorkedClusterInput) {
  const target = input.targetLevel ?? DEFAULT_SCORE_TARGET_LEVEL
  const coverage = Math.log1p(input.userSkillCount) / Math.log1p(input.totalClusterSkills)
  const levelStrength = Math.min(input.strongestLevel / target, 1)
  const clusterScore = levelStrength * (0.3 + 0.7 * coverage) * 100

  return {
    coverage: round(coverage, 4),
    levelStrength: round(levelStrength, 4),
    clusterScore: round(clusterScore, 1),
  }
}

export function workedDomainScore(clusterScore: number, userSkillCount: number): number {
  const breadth = Math.log1p(Math.max(0, userSkillCount - 1)) / Math.log1p(19)
  return round(clusterScore * (1 + 0.5 * Math.min(breadth, 1)), 1)
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
