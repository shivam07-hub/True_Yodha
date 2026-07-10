interface PostAuthDestinationInput {
  /**
   * Where the user was headed before login (session-expiry bounce, use-auth.ts).
   * DELIBERATELY IGNORED — login always lands on a known surface so there is zero
   * "why am I here?" surprise (Shivam, 2026-07-11). Kept on the input so the
   * bounce plumbing stays intact and re-enabling deep-link return is a one-line
   * change. NOTE the trade: a shared/emailed link to an authed page routes to
   * /market, not that page.
   */
  next: string | null
  firstSignup: boolean
  hasPendingAnonCv: boolean
}

export function postAuthDestination({
  firstSignup,
  hasPendingAnonCv,
}: PostAuthDestinationInput): string {
  // Exception 1: a CV dropped on the marketing page before login → claim + score it.
  if (hasPendingAnonCv) return "/cv?upload=1"
  // Brand-new signup runs the first-run onboarding stepper.
  if (firstSignup) return "/onboarding"
  // Everyone else: the daily surface, always. No `next` deep-link return.
  return "/market"
}
