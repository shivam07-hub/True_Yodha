import type { ApplicationResponse, JobMatch } from "@/lib/api"
import { isApplied, matchesById } from "@/lib/collections/model"
import { followUpLine, needsStageCheck } from "@/components/preparations/prep-model"

/**
 * The global Next action (unified-structure S2, lock #4) — ONE persistent answer
 * to "what do I do now", computed from pipeline state across all four stages.
 * The Loop Bar's "Next:" magnet, promoted to every authed surface.
 *
 * Finish-first ladder — the action closest to an outcome wins:
 *   1. no CV            → upload (nothing else exists yet)
 *   2. interviewing     → prep that room (highest stakes in the pipeline)
 *   3. applied + due    → stage-check / follow-up (time-bound, decays if missed)
 *   4. tailored, unsent → apply it (finished work waiting at the door)
 *   5. saved, untailored→ tailor the best-fit one (the core loop)
 *   6. fresh matches    → review them (Myro searched while you were away)
 *   7. otherwise        → find a role to tailor
 */

export interface NextAction {
  label: string
  href: string
  /** True for generic surface pointers — hidden when already on that surface. */
  generic?: boolean
}

const name = (a: ApplicationResponse) => a.company ?? a.title

export function deriveNextAction(
  apps: ApplicationResponse[],
  matches: JobMatch[] | undefined,
  opts: { hasCv: boolean; newJobs?: number; now?: Date },
): NextAction {
  const now = opts.now ?? new Date()

  if (!opts.hasCv) return { label: "Upload your CV", href: "/cv" }

  const interviewing = apps.find((a) => a.status === "interviewing")
  if (interviewing) {
    return {
      label: `Prep ${name(interviewing)} interview`,
      href: `/preparations/${encodeURIComponent(interviewing.job_id)}`,
    }
  }

  const due = apps.find((a) => needsStageCheck(a, now) || followUpLine(a, now) !== null)
  if (due) {
    return { label: `Check on ${name(due)}`, href: `/preparations/${encodeURIComponent(due.job_id)}` }
  }

  const inPlay = apps.filter((a) => !isApplied(a))
  const ready = inPlay.find((a) => a.cv_badge)
  if (ready) {
    return { label: `Apply to ${name(ready)}`, href: `/collections?jobId=${encodeURIComponent(ready.job_id)}` }
  }

  // Best-fit untailored save — fit joined from cached matches only (never faked;
  // absent fit still points at the row).
  const byId = matchesById(matches)
  const toTailor = inPlay
    .filter((a) => !a.cv_badge)
    .map((a) => ({ a, fit: a.match_score ?? byId.get(a.job_id)?.match_score ?? null }))
    .sort((x, y) => (y.fit ?? -1) - (x.fit ?? -1))[0]
  if (toTailor) {
    return {
      label: `Tailor ${name(toTailor.a)}${toTailor.fit !== null ? ` · ${toTailor.fit}%` : ""}`,
      href: `/cv?jobId=${encodeURIComponent(toTailor.a.job_id)}`,
    }
  }

  if ((opts.newJobs ?? 0) > 0) {
    return { label: `See ${opts.newJobs} new matches`, href: "/collections?search=1" }
  }

  return { label: "Find a role to tailor", href: "/market", generic: true }
}
