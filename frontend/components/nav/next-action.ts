import type { ApplicationResponse, JobMatch } from "@/lib/api"
import type { CvPresence } from "@/lib/cv-presence"
import { isApplied, matchesById } from "@/lib/jobs/application-stage"
import { followUpLine, needsStageCheck } from "@/components/preparations/prep-model"
import { similarRolesHref } from "@/lib/jobs/similar-roles"

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
 *
 * The chip EXTENDS the surface, it never echoes it. A surface opened on one job
 * (the playground, a prep room) already owns that job's commit as its own primary
 * CTA — the playground's "Apply with this CV" is a projection-bound action over
 * live editor state, which a cached nav link could never be. So `openJobId` drops
 * that job from the ladder and the chip answers the question the screen cannot:
 * what comes after this one. Finish here (page CTA) → next one (chip) is the loop,
 * rendered as two steps instead of one repeated twice.
 */

export interface NextAction {
  label: string
  href: string
  /** True for generic surface pointers — hidden when already on that surface. */
  generic?: boolean
}

const name = (a: ApplicationResponse) => a.company ?? a.title

/**
 * A false CV flag is meaningful only after profile truth arrives. Before that,
 * the shell must remain silent rather than inventing a first-run action.
 */
type NextActionOptions = {
  cvPresence: CvPresence
  newJobs?: number
  now?: Date
  openJobId?: string | null
  /**
   * Corpus role bucket of the job this surface is open on. Used only by the
   * final rung: when the ladder has nothing better left, someone standing on a
   * job they have just finished with — applied, or reported dead — wants more
   * of that kind, not the whole board. `/market` reads this as `cluster`.
   */
  openJobDomain?: string | null
}

type KnownCvActionOptions = Omit<NextActionOptions, "cvPresence"> & {
  cvPresence: Exclude<CvPresence, "unknown">
}

type UnknownCvActionOptions = Omit<NextActionOptions, "cvPresence"> & {
  cvPresence: "unknown"
}

export function deriveNextAction(
  allApps: ApplicationResponse[],
  matches: JobMatch[] | undefined,
  opts: UnknownCvActionOptions,
): null
export function deriveNextAction(
  allApps: ApplicationResponse[],
  matches: JobMatch[] | undefined,
  opts: KnownCvActionOptions,
): NextAction
export function deriveNextAction(
  allApps: ApplicationResponse[],
  matches: JobMatch[] | undefined,
  opts: NextActionOptions,
): NextAction | null {
  if (opts.cvPresence === "unknown") return null

  const now = opts.now ?? new Date()

  // The job open on this surface belongs to the surface, not to the chip.
  const apps = opts.openJobId ? allApps.filter((a) => a.job_id !== opts.openJobId) : allApps

  // `generic` so the chip hides on /cv itself: pointing a user at the page they
  // are already on — while their CV is mid-analysis, `has_cv` still false — reads
  // as the app not knowing what it just asked for.
  if (opts.cvPresence === "absent") return { label: "Upload your CV", href: "/cv", generic: true }

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
  const priorityFirst = (a: ApplicationResponse, b: ApplicationResponse) =>
    Number(Boolean(b.is_priority)) - Number(Boolean(a.is_priority))
  const ready = inPlay.filter((a) => a.cv_badge).sort(priorityFirst)[0]
  if (ready) {
    return { label: `Apply to ${name(ready)}`, href: `/collections?jobId=${encodeURIComponent(ready.job_id)}` }
  }

  // Best-fit untailored save — fit joined from cached matches only (never faked;
  // absent fit still points at the row).
  const byId = matchesById(matches)
  const toTailor = inPlay
    .filter((a) => !a.cv_badge)
    .map((a) => ({ a, fit: a.match_score ?? byId.get(a.job_id)?.match_score ?? null }))
    .sort((x, y) => priorityFirst(x.a, y.a) || (y.fit ?? -1) - (x.fit ?? -1))[0]
  if (toTailor) {
    return {
      label: `Tailor ${name(toTailor.a)}${toTailor.fit !== null ? ` · ${toTailor.fit}%` : ""}`,
      href: `/cv?jobId=${encodeURIComponent(toTailor.a.job_id)}`,
    }
  }

  if ((opts.newJobs ?? 0) > 0) {
    return { label: `See ${opts.newJobs} new matches`, href: "/collections?search=1" }
  }

  // Last rung. The two endings of a job surface — "I applied" and "this listing
  // is dead" — both land here, because neither leaves anything better on the
  // ladder. Both are the same question: what else looks like this one. The
  // surface's own inline "find similar" answered it on some screens and was
  // wired to nothing on the CV surfaces; this chip is the one answer.
  const domain = opts.openJobDomain?.trim()
  if (domain) {
    return { label: `More ${domain} roles`, href: similarRolesHref(domain), generic: true }
  }
  return { label: "Find a role to tailor", href: "/market", generic: true }
}
