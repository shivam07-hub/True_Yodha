/**
 * identityLines — the contact block, derived once.
 *
 * Three surfaces each built this fallback chain by hand (CV contact → profile →
 * first role's title), and they disagreed: the anon pane showed email only, the
 * authed pane showed email + LinkedIn, and the exported sheet showed all six.
 * The recruiter reads one of those, so there is one derivation now.
 */
import type { CVStructured, UserProfile } from "@/lib/api"
import type { IdentityLines } from "./cv-identity-card"

export function identityLines(
  cv: CVStructured,
  profile: UserProfile | null,
): IdentityLines {
  const c = cv.contact
  return {
    name: c?.name?.trim() || profile?.full_name?.trim() || "Your name",
    title: c?.title?.trim() || cv.experience[0]?.role || "",
    meta: [
      c?.email?.trim() || profile?.email?.trim(),
      c?.phone?.trim(),
      c?.location?.trim() || profile?.target_location?.trim(),
      c?.linkedin?.trim() || profile?.linkedin_url?.trim(),
    ].filter((v): v is string => !!v),
  }
}
