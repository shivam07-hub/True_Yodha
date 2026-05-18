"use client"

import { useMemo } from "react"
import type { CVVersion } from "@/lib/api"
import { formatGlobalVersionLabel, formatVersionContext } from "@/components/cv/version-picker"

export interface CVVersionLedgerStats {
  totalVersions: number
  masterVersions: number
  companyVersions: number
  companyCount: number
  jobCount: number
}

interface CVVersionLedgerProps {
  versions: CVVersion[]
  selectedId: number | null
  onSelect: (id: number) => void
  baselineDisplayText: string
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
  if (version.kind === "baseline_upload") return "Master baseline"
  if (version.kind === "polished") return "AI polished"
  if (version.kind === "edited") return "Edited CV"
  return "Company CV"
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

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      padding: "10px 12px",
      border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-sm)",
      background: "var(--tm-bg)",
      minWidth: 0,
    }}>
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 18, lineHeight: 1, color: "var(--tm-text)" }}>
        {value}
      </div>
      <div className="tm-label-caps" style={{ marginTop: 6, color: "var(--tm-text-faint)" }}>
        {label}
      </div>
    </div>
  )
}

export function CVVersionLedger({
  versions,
  selectedId,
  onSelect,
  baselineDisplayText,
}: CVVersionLedgerProps) {
  const sortedVersions = useMemo(() => sortLedgerVersions(versions), [versions])
  const stats = useMemo(() => summarizeCVVersionLedger(sortedVersions), [sortedVersions])
  const currentBaseline = useMemo(
    () => sortedVersions.find(v => v.kind === "baseline_upload") ?? null,
    [sortedVersions],
  )
  const selected = useMemo(
    () => sortedVersions.find(v => v.id === selectedId) ?? currentBaseline ?? sortedVersions[0] ?? null,
    [currentBaseline, selectedId, sortedVersions],
  )
  const previewText = getLedgerPreviewText(selected, baselineDisplayText, currentBaseline?.id)

  return (
    <section
      aria-label="CV version history"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius-lg)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 18px 14px",
          borderBottom: "1px solid var(--tm-border-soft)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <div>
            <div className="tm-label-caps" style={{ color: "var(--tm-accent)", marginBottom: 6 }}>
              CV version history
            </div>
            <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.25, color: "var(--tm-text)" }}>
              All CV commits
            </h2>
          </div>
          <div style={{
            fontFamily: "var(--tm-font-mono)",
            fontSize: 12,
            color: "var(--tm-accent)",
            border: "1px solid var(--tm-accent-ring)",
            borderRadius: 999,
            padding: "5px 10px",
            whiteSpace: "nowrap",
          }}>
            {stats.totalVersions} total
          </div>
        </div>

        <div style={{
          padding: 14,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          borderBottom: "1px solid var(--tm-border-soft)",
        }}>
          <Stat label="versions" value={stats.totalVersions} />
          <Stat label="companies" value={stats.companyCount} />
          <Stat label="jobs" value={stats.jobCount} />
        </div>

        <div role="list" style={{ maxHeight: 520, overflowY: "auto" }}>
          {sortedVersions.map(version => {
            const isSelected = selected?.id === version.id
            const isCurrentMaster = version.kind === "baseline_upload" && currentBaseline?.id === version.id
            return (
              <div key={version.id} role="listitem">
                <button
                  type="button"
                  onClick={() => onSelect(version.id)}
                  aria-current={isSelected ? "true" : undefined}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    border: "none",
                    borderBottom: "1px solid var(--tm-border-soft)",
                    background: isSelected ? "var(--tm-accent-wash)" : "transparent",
                    color: "var(--tm-text)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{
                      fontFamily: "var(--tm-font-mono)",
                      fontSize: 12,
                      color: isSelected ? "var(--tm-accent)" : "var(--tm-text)",
                    }}>
                      {formatLedgerVersionName(version)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--tm-text-faint)", whiteSpace: "nowrap" }}>
                      {timeAgo(version.created_at)}
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: "var(--tm-text-faint)" }}>
                    {formatLedgerVersionKind(version)} / {formatGlobalVersionLabel(version)}
                    {isCurrentMaster ? " / current master" : null}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.45, color: "var(--tm-text-muted)" }}>
                    {formatLedgerVersionContext(version)}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius-lg)",
        overflow: "hidden",
        minWidth: 0,
      }}>
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--tm-border-soft)",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 13, color: "var(--tm-text)" }}>
              {selected ? formatLedgerVersionName(selected) : "CV preview"}
            </div>
            {selected && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--tm-text-faint)" }}>
                {formatLedgerVersionContext(selected)}
              </div>
            )}
          </div>
          {selected && (
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)", alignSelf: "center" }}>
              {formatLedgerVersionKind(selected)} / {formatGlobalVersionLabel(selected)}
            </div>
          )}
        </div>
        <pre style={{
          margin: 0,
          padding: "20px 22px",
          fontFamily: "var(--tm-font-mono)",
          fontSize: 12.5,
          lineHeight: 1.75,
          color: "var(--tm-text-muted)",
          whiteSpace: "pre-wrap",
          minHeight: 520,
          maxHeight: 680,
          overflow: "auto",
        }}>{previewText}</pre>
      </div>
    </section>
  )
}
