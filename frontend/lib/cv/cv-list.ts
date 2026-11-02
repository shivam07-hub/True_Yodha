/** Company + title, for spotting two postings that would otherwise look identical. */
export function titleKey(company: string, title: string): string {
  return `${company.trim().toLowerCase()}\n${title.trim().toLowerCase()}`
}

/** Keys that appear more than once. Those rows show location. */
export function duplicateTitleKeys(rows: { company: string; title: string }[]): Set<string> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = titleKey(row.company, row.title)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const duplicates = new Set<string>()
  for (const [key, count] of counts) {
    if (count > 1) duplicates.add(key)
  }
  return duplicates
}
