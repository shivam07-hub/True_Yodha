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
  /** ≤3-word label for the compact rail renderer (CompactMoves). */
  short: string
  /** Compact metric chip for the rail — "+6" (skill gain) or "21%" (job fit). */
  metric?: string
  /**
   * Honest projected Myro Score gain (whole points) for moves whose impact is a
   * real what-if re-run of the engine — the skill step only. Omitted where the
   * gain isn't cleanly attributable (job/cv), so we never show a fabricated number.
   */
  gain?: number
}

export interface BestJobInput {
  jobId: string
  title: string
  company: string | null
  /** Match strength 0–100. */
  fit: number
  /** The search that found it, in the user's own words. Absent for a
   *  single-search user, whose step keeps the generic "Best-fit job" eyebrow —
   *  naming a search that has no sibling explains nothing. */
  searchLabel?: string
}

export interface NextStepsInput {
  score: number
  gapSkills: GapSkill[]
  domainScores: Record<string, number>
  /** One per search, in the searches' own order. A single-search user — 83% of
   *  them — has exactly one here and the rail is what it always was. */
  bestJobs: BestJobInput[]
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
    const gain = gap.score_delta && gap.score_delta >= 1 ? Math.round(gap.score_delta) : undefined
    steps.push({
      kind: "skill",
      rank: 1,
      eyebrow: "Top skill gap",
      title: `Practice ${gap.skill}`,
      detail: `${inDemand}level ${gap.current_level} → ${gap.target_level}, your highest-impact lift.`,
      href: `/practice?skill=${encodeURIComponent(gap.skill)}`,
      cta: "Practice",
      short: `Practice ${gap.skill}`,
      metric: gain ? `+${gain}` : undefined,
      gain,
    })
  } else if (lo) {
    steps.push({
      kind: "skill",
      rank: 1,
      eyebrow: "Build a skill",
      title: `Practice your ${domainLabel(lo.key)} skills`,
      detail: `${domainLabel(lo.key)} is your lowest area at ${Math.round(lo.val)}% — practice lifts it fastest.`,
      href: "/practice",
      cta: "Practice",
      short: `Practice ${domainLabel(lo.key)}`,
    })
  }

  // 2 — best-fit job → view & apply (fallback: browse the matched feed).
  //
  // ONE PER SEARCH. Someone running two searches has two strongest matches, and
  // collapsing them to the higher-scoring one hides the second search's entry to
  // the tailor loop, which is the reason they opened it. The eyebrow carries the
  // search's own words so the two are told apart by name, not by position.
  if (input.bestJobs.length > 0) {
    input.bestJobs.forEach((best, i) => {
      const at = best.company ? ` at ${best.company}` : ""
      steps.push({
        kind: "job",
        rank: 2 + i,
        eyebrow: best.searchLabel ?? "Best-fit job",
        title: `Apply to ${best.title}${at}`,
        detail: `${best.fit}% fit — your strongest match right now.`,
        // /collections directly, not /home. `/home` is a retired redirect stub
        // that forwards `?jobId=` here, so pointing at it cost every click an
        // extra client-side hop. The stub stays for bookmarks and old emails —
        // it just no longer has an internal producer.
        href: `/collections?jobId=${encodeURIComponent(best.jobId)}`,
        cta: "View job",
        short: best.company ? `Apply · ${best.company}` : "Apply to top match",
        metric: `${best.fit}%`,
      })
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
      short: "Browse jobs",
    })
  }

  // 3 — weakest scored area → tailor the CV (the actionable half of "why is my
  // score low"). The lowest domain is the score-derived lever; tailoring lifts it
  // faster than a generic CV.
  if (lo) {
    steps.push({
      kind: "cv",
      rank: steps.length + 1,
      eyebrow: "Strengthen your CV",
      title: `Show more ${domainLabel(lo.key)} on your CV`,
      detail: `${domainLabel(lo.key)} scores lowest at ${Math.round(lo.val)}%. Tailoring to a role lifts it fastest.`,
      href: cvHref(input.tailorJobId),
      cta: "Tailor CV",
      short: "Tailor CV",
    })
  } else {
    steps.push({
      kind: "cv",
      rank: steps.length + 1,
      eyebrow: "Strengthen your CV",
      title: "Tailor your CV to a role",
      detail: "A role-specific version scores higher than a generic CV.",
      href: cvHref(input.tailorJobId),
      cta: "Tailor CV",
      short: "Tailor CV",
    })
  }

  return steps
}
