/**
 * What the Ghost Job Index knows about the employer whose job you are reading.
 *
 * The index has been public since it shipped and reachable from the footer,
 * which means every logged-in user with a CV, a shortlist and an application in
 * flight has been unable to find it. This is the model that puts it where the
 * question is actually asked: on the job, at the moment someone decides whether
 * to spend an evening on an application.
 *
 * One model function, both skins, same rule as `livenessNotice` — desktop and
 * mobile cannot tell a user different things about the same employer.
 */

import type { GhostIndexRow } from "@/lib/api"

export interface EmployerRecord {
  /** Sentence shown to the user. Always names the denominator. */
  text: string
  /** `warn` only where the pattern is bad enough to change a decision. */
  tone: "warn" | "info" | "good"
}

/** Company names arrive from job rows and index rows separately; match loosely
 *  enough to survive whitespace and case, never loosely enough to guess. */
function sameCompany(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function employerRecord(
  company: string | null | undefined,
  companies: GhostIndexRow[] | undefined,
): EmployerRecord | null {
  if (!company || !companies?.length) return null
  const row = companies.find((c) => sameCompany(c.scope_key, company))

  // Absent means the index withheld this employer for too few observations, and
  // silence is the only honest rendering of that. Saying "no data" invites the
  // reader to hear "nothing to worry about", which we have not established.
  if (!row || row.still_advertised_rate === null) return null

  const of = `${row.still_advertised} of ${row.feed_overlap} closed roles`

  if (row.still_advertised_rate >= 0.5) {
    return {
      tone: "warn",
      text: `${company} tends to leave closed roles advertised: ${of} we checked were still listed after the role was gone.`,
    }
  }
  if (row.still_advertised_rate >= 0.2) {
    return {
      tone: "info",
      text: `${company} sometimes leaves closed roles up: ${of} we checked were still listed after the role was gone.`,
    }
  }
  return {
    tone: "good",
    text: `${company} takes closed roles down promptly: ${of} we checked were still listed afterwards.`,
  }
}
