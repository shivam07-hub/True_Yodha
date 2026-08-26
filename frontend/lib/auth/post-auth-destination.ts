interface PostAuthDestinationInput {
  firstSignup: boolean
  hasPendingAnonCv: boolean
  /** The anon user clicked Save on a job card before auth (Exception 2). */
  hasPendingJobSave: boolean
  /**
   * The Chrome extension opened the connect handshake while logged out
   * (Exception 0). Already validated against EXTENSION_REDIRECT_RE by the
   * stash; null when absent.
   */
  pendingExtensionConnect: string | null
  /**
   * The visitor arrived from a skills-led newsletter issue via `?intent=prep`
   * (Exception 3). A marker, never a URL — the destination below is hardcoded.
   */
  hasPendingPrepIntent: boolean
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
  pendingExtensionConnect,
  hasPendingPrepIntent,
}: PostAuthDestinationInput): string {
  // Exception 0: the extension is mid-handshake and blocked on a session. It
  // outranks the others because it is the only intent the user cannot resume by
  // navigating — the redirect_uri came from launchWebAuthFlow and is gone once
  // this tab moves on. A stashed CV or job save is still there afterwards.
  if (pendingExtensionConnect) {
    return `/extension/connect?redirect_uri=${encodeURIComponent(pendingExtensionConnect)}`
  }
  // Exception 1: a CV dropped on the marketing page before login → claim + score it.
  if (hasPendingAnonCv) return "/cv?upload=1"
  // Exception 2: a job saved from a job card → the replay saves it; land on the
  // saved worklist so it's the first thing they see. Carried intent overrides
  // onboarding, exactly as the anon-CV claim does.
  if (hasPendingJobSave) return "/collections"
  // Exception 3: the visitor came from a newsletter issue that ended in the
  // skills a city's employers ask for. Land them on Preparation so the issue's
  // last line and the product's first screen are the same thing. Like the two
  // above it this outranks onboarding: the carried intent is the reason they
  // signed up, and onboarding is still reachable afterwards.
  if (hasPendingPrepIntent) return "/preparations"
  // Brand-new signup runs the first-run onboarding stepper.
  if (firstSignup) return "/onboarding"
  // Everyone else: the daily surface, always.
  return "/market"
}
