interface PostAuthDestinationInput {
  firstSignup: boolean
  hasPendingAnonCv: boolean
  /** The anon user clicked Save on a job card before auth (Exception 2). */
  hasPendingJobSave: boolean
}

/**
 * Where a user lands after auth, keyed on CARRIED INTENT — never on a URL the
 * caller asked for. There is deliberately no deep-link return (Shivam,
 * 2026-07-11): login always ends on a known surface, so there is zero "why am I
 * here?" surprise. A shared or emailed link to an authed page routes to /market.
 *
 * The old `next` input existed to support that return and was ignored for its
 * whole life, while 27 lines of plumbing across the gate store, the modal and
 * both auth forms kept threading it — teaching every reader that deep-link
 * return worked. Deleted 2026-07-31. If it is ever wanted, add it here first and
 * thread it afterwards; a dead parameter is worse than a missing one.
 */
export function postAuthDestination({
  firstSignup,
  hasPendingAnonCv,
  hasPendingJobSave,
}: PostAuthDestinationInput): string {
  // Exception 1: a CV dropped on the marketing page before login → claim + score it.
  if (hasPendingAnonCv) return "/cv?upload=1"
  // Exception 2: a job saved from a job card → the replay saves it; land on the
  // saved worklist so it's the first thing they see. Carried intent overrides
  // onboarding, exactly as the anon-CV claim does.
  if (hasPendingJobSave) return "/collections"
  // Brand-new signup runs the first-run onboarding stepper.
  if (firstSignup) return "/onboarding"
  // Everyone else: the daily surface, always.
  return "/market"
}
