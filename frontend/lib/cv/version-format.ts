/**
 * Pure formatters for CV versions.
 *
 * Extracted from the old visual components so tests + multiple views can share
 * the same labels. Visual components import the formatters they need; they
 * never reimplement label rules locally.
 */
import type { CVVersion } from "@/lib/api"

export interface CVVersionLedgerStats {
  totalVersions: number
  masterVersions: number
  companyVersions: number
  companyCount: number
  jobCount: number
}

export function formatGlobalVersionLabel(version: CVVersion): string {
  return `Copy ${version.user_version_number}`
}

function oldestFirst(versions: CVVersion[]): CVVersion[] {
  return [...versions].sort((a, b) => {
    const byVersion = a.user_version_number - b.user_version_number
    if (byVersion !== 0) return byVersion
    return a.id - b.id
  })
}

function companyVersions(threadVersions: CVVersion[]): CVVersion[] {
  return threadVersions.filter(v => v.kind !== "baseline_upload")
}

export function formatThreadVersionLabel(version: CVVersion, threadVersions: CVVersion[]): string {
  if (version.kind === "baseline_upload") return "Master CV"
  const index = oldestFirst(companyVersions(threadVersions)).findIndex(v => v.id === version.id)
  if (index === -1) return formatGlobalVersionLabel(version)
  return `Tailored copy ${index + 1}`
}

export function formatVersionContext(version: CVVersion): string {
  if (version.kind === "baseline_upload") return "Main CV"
  return [version.job_title, version.company_name].filter(Boolean).join(" · ") || "Job-specific version"
}

export function formatParentVersionLabel(
  parentVersionId: number | null,
  threadVersions: CVVersion[],
  lineageVersions: CVVersion[] = threadVersions,
): string | null {
  if (!parentVersionId) return null
  const parent = lineageVersions.find(v => v.id === parentVersionId)
  if (!parent) return null
  if (parent.kind === "baseline_upload") return "Master CV"
  if (threadVersions.some(v => v.id === parent.id)) return formatThreadVersionLabel(parent, threadVersions)
  return formatGlobalVersionLabel(parent)
}

export function sortLedgerVersions(versions: CVVersion[]): CVVersion[] {
  return [...versions].sort((a, b) => {
    const byVersion = b.user_version_number - a.user_version_number
    if (byVersion !== 0) return byVersion
    return b.id - a.id
  })
}

export function summarizeCVVersionLedger(versions: CVVersion[]): CVVersionLedgerStats {
  const companyRows = versions.filter(v => v.kind !== "baseline_upload")
  const companies = new Set(companyRows.map(v => v.company_name).filter(Boolean))
  const jobs = new Set(companyRows.map(v => v.job_id).filter(Boolean))
  return {
    totalVersions: versions.length,
    masterVersions: versions.length - companyRows.length,
    companyVersions: companyRows.length,
    companyCount: companies.size,
    jobCount: jobs.size,
  }
}

export function formatLedgerVersionName(version: CVVersion): string {
  if (version.kind === "baseline_upload") return "Master CV"
  return formatGlobalVersionLabel(version)
}

export function formatLedgerVersionKind(version: CVVersion): string {
  if (version.kind === "baseline_upload") return "Main CV"
  if (version.kind === "polished") return "AI polished"
  if (version.kind === "edited") return "Edited copy"
  return "Tailored CV"
}

export function formatLedgerVersionContext(version: CVVersion): string {
  return formatVersionContext(version)
}

export function getLedgerPreviewText(
  version: CVVersion | null,
  baselineDisplayText: string,
  currentBaselineId?: number | null,
): string {
  if (!version) return baselineDisplayText || "-"
  if (version.kind === "baseline_upload") {
    if (currentBaselineId == null || version.id === currentBaselineId) {
      return baselineDisplayText || version.body_text || "-"
    }
    return version.body_text.trim().length > 0 ? version.body_text : "-"
  }
  const polished = version.polished_text?.trim()
  if (polished) return version.polished_text ?? "-"
  return version.body_text.trim().length > 0 ? version.body_text : "-"
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - t)
  const s = Math.floor(diff / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
