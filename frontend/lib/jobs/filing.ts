/** What the filing gate is waiting on, in the order the API returns blocks. */

const LINES: Record<string, string> = {
  listing_closed: "This role is closed.",
  listing_unconfirmed: "Filing waits until a check finds this role open.",
  below_judge: "Filing waits for a judge score of 3.5 or higher.",
  no_tailored_cv: "Tailor a CV for this role before filing.",
  no_yes: "Filing waits for a yes on this CV.",
  stale_cv: "Approve the latest CV for this role.",
  receipt_host: "Open the company page, then save the confirmation.",
  receipt_text: "The confirmation on the page is too short to count.",
}

const HOLDS: Record<string, string> = {
  login: "Sign in on the company page, then fill from the extension.",
  captcha: "The company page asked for a check. Finish it there.",
  unanswered: "A question on the form is absent from this CV. Fill that one yourself.",
  resume: "Attach the CV for this job on the company page.",
}

export function filingLine(block: string | undefined): string | null {
  if (!block) return null
  return LINES[block] ?? null
}

export function filingHoldLine(reason: string | null | undefined): string | null {
  if (!reason) return null
  return HOLDS[reason] ?? null
}
