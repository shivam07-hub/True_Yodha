/**
 * 2-letter company initials for the logo tile — first letter of the first two
 * words, uppercased; falls back to "CO" for an empty name. Pure (no React/CSS)
 * so it's the shared source for every company-tile treatment and is testable in
 * isolation.
 */
export function companyInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length === 0) return "CO"
  // One word → first two letters (Accenture → AC); multi-word → first letter of
  // the first two words (Deloitte India → DI). Matches the handoff tiles.
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
