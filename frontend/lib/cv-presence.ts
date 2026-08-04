/**
 * CV truth for shared authenticated chrome.
 *
 * `unknown` is intentionally distinct from `absent`: a cold session has not
 * earned a product decision yet, so controls must wait rather than treating a
 * pending profile request as a first-run account.
 */
export type CvPresence = "unknown" | "present" | "absent"

export function cvPresenceFromProfile(
  profile: { has_cv: boolean } | undefined,
): CvPresence {
  if (profile === undefined) return "unknown"
  return profile.has_cv ? "present" : "absent"
}
