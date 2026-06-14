import { redirect } from "next/navigation"

/**
 * `/skills` was absorbed into Practice (`/forge`) as peer-tabs (Practice | Audit).
 * The Map (domain radar) moved to the home rail, so legacy `?domain` deep-links
 * land on Practice. This stub translates legacy params, so live CV-score-reveal
 * links, bookmarks, and old shares never 404.
 *
 *   ?skill=X  → /forge?skill=X             (Practice tab, start that skill)
 *   ?domain=X → /forge                     (Map retired here — radar is on /home)
 *   (bare)    → /forge
 */
export default async function SkillsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const skill = first(params.skill)

  if (skill) redirect(`/forge?skill=${encodeURIComponent(skill)}`)
  redirect("/forge")
}
