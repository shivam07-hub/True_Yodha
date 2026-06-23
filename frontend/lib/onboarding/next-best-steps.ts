import type { GapSkill } from "@/lib/api"
import { domainLabel } from "@/lib/domain-labels"

/**
 * Post-score "Your next 3 steps" — turns the user's own Myro Score breakdown into
 * three ranked, named, tappable moves (issue #146). Pure + deterministic so the
 * derivation and routing are unit-testable apart from the view.
 *
 * The triad is the impact ranking the issue specifies:
 *   1 skill — close the highest-leverage gap   → Practice
 *   2 job   — apply to the strongest match       → job detail / apply
 *   3 cv    — strengthen the weakest scored area  → CV tailoring
 *
 * Each role always renders (degrading to a sensible fallback) so the panel reads
 * as a coherent three-move plan rather than a variable-length list. Tone is
 * strengths-aware: a low score is "the fastest way up", never "what you lack".
 */
export type NextStepKind = "skill" | "job" | "cv"

export interface NextBestStep {
  kind: NextStepKind
  /** 1-based impact rank — fixed skill→job→cv. */
  rank: number
  eyebrow: string
  title: string
  detail: string
  href: string
  cta: string
}

export interface BestJobInput {
  jobId: string
  title: string
  company: string | null
  /** Match strength 0–100. */
  fit: number
}

export interface NextStepsInput {
  score: number
  gapSkills: GapSkill[]
  domainScores: Record<string, number>
  bestJob: BestJobInput | null
  /** Credible job id for the Step-3 tailor deep-link; null → plain /cv. */
  tailorJobId: string | null
}

function topGap(gaps: GapSkill[]): GapSkill | null {
  if (gaps.length === 0) return null
  return [...gaps].sort(
    (a, b) => b.gap_score - a.gap_score || b.job_count_30d - a.job_count_30d,
  )[0] ?? null
}

function lowestDomain(domainScores: Record<string, number>): { key: string; val: number } | null {
  let lo: { key: string; val: number } | null = null
  for (const [key, val] of Object.entries(domainScores)) {
    if (typeof val !== "number") continue
    if (lo === null || val < lo.val) lo = { key, val }
  }
  return lo
}

function cvHref(tailorJobId: string | null): string {
  return tailorJobId ? `/cv?jobId=${encodeURIComponent(tailorJobId)}` : "/cv"
}

export function deriveNextBestSteps(input: NextStepsInput): NextBestStep[] {
  const hasBreakdown =
    input.gapSkills.length > 0 || Object.keys(input.domainScores).length > 0
  // No score yet / nothing to reason over — FirstRunHero owns that moment.
  if (input.score <= 0 || !hasBreakdown) return []

  const steps: NextBestStep[] = []
  const lo = lowestDomain(input.domainScores)

  // 1 — top skill gap → Practice (fallback: practise the weakest domain).
  const gap = topGap(input.gapSkills)
  if (gap) {
    const inDemand =
      gap.job_count_30d > 0
        ? `Wanted in ${gap.job_count_30d} recent ${gap.job_count_30d === 1 ? "job" : "jobs"} · `
        : ""
    steps.push({
      kind: "skill",
      rank: 1,
      eyebrow: "Top skill gap",
      title: `Practice ${gap.skill}`,
      detail: `${inDemand}level ${gap.current_level} → ${gap.target_level}, your highest-impact lift.`,
      href: `/forge?skill=${encodeURIComponent(gap.skill)}`,
      cta: "Practice",
    })
  } else if (lo) {
    steps.push({
      kind: "skill",
      rank: 1,
      eyebrow: "Build a skill",
      title: `Practice your ${domainLabel(lo.key)} skills`,
      detail: `${domainLabel(lo.key)} is your lowest area at ${Math.round(lo.val)}% — practice lifts it fastest.`,
      href: "/forge",
      cta: "Practice",
    })
  }

  // 2 — best-fit job → view & apply (fallback: browse the matched feed).
  if (input.bestJob) {
    const at = input.bestJob.company ? ` at ${input.bestJob.company}` : ""
    steps.push({
      kind: "job",
      rank: 2,
      eyebrow: "Best-fit job",
      title: `Apply to ${input.bestJob.title}${at}`,
      detail: `${input.bestJob.fit}% fit — your strongest match right now.`,
      href: `/home?jobId=${encodeURIComponent(input.bestJob.jobId)}`,
      cta: "View job",
    })
  } else {
    steps.push({
      kind: "job",
      rank: 2,
      eyebrow: "Best-fit job",
      title: "Find roles that match your CV",
      detail: "Myro ranks live jobs by how well they fit you.",
      href: "/market",
      cta: "Browse jobs",
    })
  }

  // 3 — weakest scored area → tailor the CV (the actionable half of "why is my
  // score low"). The lowest domain is the score-derived lever; tailoring lifts it
  // faster than a generic CV.
  if (lo) {
    steps.push({
      kind: "cv",
      rank: 3,
      eyebrow: "Strengthen your CV",
      title: `Show more ${domainLabel(lo.key)} on your CV`,
      detail: `${domainLabel(lo.key)} scores lowest at ${Math.round(lo.val)}%. Tailoring to a role lifts it fastest.`,
      href: cvHref(input.tailorJobId),
      cta: "Tailor CV",
    })
  } else {
    steps.push({
      kind: "cv",
      rank: 3,
      eyebrow: "Strengthen your CV",
      title: "Tailor your CV to a role",
      detail: "A role-specific version scores higher than a generic CV.",
      href: cvHref(input.tailorJobId),
      cta: "Tailor CV",
    })
  }

  return steps
}
