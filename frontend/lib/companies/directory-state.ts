import type { IndexableCompaniesResponse } from "@/lib/api"

export interface DirectoryCompany {
  name: string
  count: number
  industry: string | null
}

export type DirectoryAvailability = "ready" | "unavailable"

export type CompaniesDirectoryState =
  | { kind: "ready"; companies: DirectoryCompany[] }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "empty" }

interface ResolveCompaniesDirectoryStateInput {
  initialStatus: DirectoryAvailability
  initialCompanies: DirectoryCompany[]
  recovery: IndexableCompaniesResponse | undefined
  isRecovering: boolean
  recoveryFailed: boolean
}

function companiesFrom(response: IndexableCompaniesResponse): DirectoryCompany[] {
  return response.companies.map((company) => ({
    name: company.name,
    count: company.active_count,
    industry: null,
  }))
}

function isReady(response: IndexableCompaniesResponse): boolean {
  // The endpoint used to omit status, and those responses were always a
  // completed read. Keeping that compatibility prevents a rolling deploy from
  // turning healthy old-backend responses into a false unavailable state.
  return response.status !== "unavailable"
}

/**
 * The directory has three data truths, never one overloaded empty array:
 * completed data, an in-flight recovery, or an unavailable upstream. A real
 * empty list is possible only after a completed `ready` response.
 */
export function resolveCompaniesDirectoryState({
  initialStatus,
  initialCompanies,
  recovery,
  isRecovering,
  recoveryFailed,
}: ResolveCompaniesDirectoryStateInput): CompaniesDirectoryState {
  if (recovery && isReady(recovery)) {
    const companies = companiesFrom(recovery)
    return companies.length > 0 ? { kind: "ready", companies } : { kind: "empty" }
  }

  if (initialStatus === "ready") {
    return initialCompanies.length > 0
      ? { kind: "ready", companies: initialCompanies }
      : { kind: "empty" }
  }

  if (isRecovering) return { kind: "loading" }
  if (recoveryFailed || recovery?.status === "unavailable") return { kind: "unavailable" }
  return { kind: "loading" }
}
