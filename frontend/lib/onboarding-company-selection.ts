interface FollowedCompanyLike {
  company_name: string
}

export function companyKey(name: string): string {
  return normalizeCompanyName(name).toLowerCase()
}

export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

export function shouldSearchCompanies(query: string): boolean {
  return normalizeCompanyName(query).length >= 2
}

export function companyInitials(name: string): string {
  const parts = normalizeCompanyName(name).split(" ").filter(Boolean)
  if (parts.length === 0) return "CO"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function isCompanySelected(companies: string[], companyName: string): boolean {
  const key = companyKey(companyName)
  return companies.some((name) => companyKey(name) === key)
}

export function prependCompany(companies: string[], companyName: string, limit: number): string[] {
  const normalized = normalizeCompanyName(companyName)
  if (!normalized || isCompanySelected(companies, normalized) || companies.length >= limit) {
    return companies
  }
  return [normalized, ...companies]
}

export function removeCompany(companies: string[], companyName: string): string[] {
  const key = companyKey(companyName)
  return companies.filter((name) => companyKey(name) !== key)
}

export function followedRowsToNames(rows: FollowedCompanyLike[]): string[] {
  const names: string[] = []
  for (const row of rows) {
    const normalized = normalizeCompanyName(row.company_name)
    if (normalized && !isCompanySelected(names, normalized)) {
      names.push(normalized)
    }
  }
  return names
}
