/**
 * Skills-map row → that Gaps card. A long JD sentence matches the skill name
 * it contains; a short name matches a requirement that names it.
 */
export function gapCardMatches(focus: string, names: string[]): boolean {
  const f = focus.toLowerCase().trim()
  if (!f) return false
  return names.some((n) => {
    const x = n.toLowerCase().trim()
    return x.length > 1 && (f.includes(x) || x.includes(f))
  })
}
