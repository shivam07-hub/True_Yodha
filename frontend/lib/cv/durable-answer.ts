import type { CVStructured, CVVersion } from "@/lib/api"

/** True when a payload is a CV we can show or edit, not an identity header. */
export function hasCvContent(value: CVStructured | null | undefined): value is CVStructured {
  if (!value) return false
  return Boolean(
    value.summary?.trim()
    || value.skills_line?.trim()
    || (value.experience ?? []).length
    || (value.projects ?? []).length
    || (value.education ?? []).length
    || (value.certs ?? []).length,
  )
}

export function latestBaseline(versions: CVVersion[] | undefined): CVVersion | null {
  return (versions ?? []).reduce<CVVersion | null>((best, version) => {
    if (version.kind !== "baseline_upload") return best
    if (best == null || version.user_version_number > best.user_version_number) return version
    return best
  }, null)
}
