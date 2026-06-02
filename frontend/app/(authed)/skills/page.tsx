import { redirect } from "next/navigation"

/**
 * `/skills` was absorbed into Practice (`/forge`) as peer-tabs (Practice | Map |
 * Audit). This stub translates legacy / deep-link params and redirects, so live
 * CV-score-reveal links, bookmarks, and old shares never 404.
 *
 *   ?domain=X → /forge?view=map&domain=X   (Map tab, drill that domain)
 *   ?skill=X  → /forge?skill=X             (Practice tab, start that skill)
 *   (bare)    → /forge
 */
export default async function SkillsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const domain = first(params.domain)
  const skill = first(params.skill)

  if (skill) redirect(`/forge?skill=${encodeURIComponent(skill)}`)
  if (domain) redirect(`/forge?view=map&domain=${encodeURIComponent(domain)}`)
  redirect("/forge")
}
