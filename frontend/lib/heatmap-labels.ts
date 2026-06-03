const ACRONYM_WORDS = new Set(["ai", "api", "aws", "crm", "css", "gcp", "hr", "html", "ml", "nlp", "qa", "sql", "ui", "ux"])

export function shortHeatmapSkillLabel(skill: string): string {
  const clean = skill.replace(/\([^)]*\)/g, "").replace(/[/_-]+/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return "Skill"

  const words = clean.split(" ").filter(Boolean)
  const initials = words.map((word) => word[0]?.toUpperCase() ?? "").join("")
  if (words.length > 1 && words.length <= 3 && initials.length >= 2 && initials.length <= 4) return initials
  if (clean.length <= 8) return clean

  const primary = words[0] ?? clean
  const secondary = words.find((word, index) => index > 0 && !isConnector(word))
  const label = secondary ? `${abbrev(primary)} ${compactWord(secondary)}` : abbrev(primary)
  return label.slice(0, 8).trim()
}

function isConnector(word: string): boolean {
  return ["and", "or", "of", "for", "to", "in", "with"].includes(word.toLowerCase())
}

function abbrev(word: string): string {
  const lower = word.toLowerCase()
  if (ACRONYM_WORDS.has(lower)) return lower.toUpperCase()
  if (word.length <= 4) return word
  return `${word.slice(0, 4)}${word.length > 6 ? "" : "."}`
}

function compactWord(word: string): string {
  if (word.length <= 4) return word
  const consonants = word.replace(/[aeiou]/gi, "")
  const compact = `${word[0] ?? ""}${consonants.slice(1, 3)}`.replace(/\s/g, "")
  return compact.length >= 3 ? titleCase(compact) : abbrev(word)
}

function titleCase(word: string): string {
  return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase()
}
