"use client"

import type { JobSearchItem } from "@/lib/api"
import { formatJobLocation } from "@/lib/format-location"

function LocationBadge({ mode }: { mode: string | null | undefined }) {
  if (!mode || mode === "unknown") return null
  const labels: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }
  const colors: Record<string, string> = {
    remote: "var(--tm-int-border-soft)",
    hybrid: "color-mix(in oklab, var(--tm-warning) 14%, transparent)",
    onsite: "color-mix(in oklab, var(--tm-text-faint) 12%, transparent)",
  }
  return (
    <span style={{
      fontSize: 10, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em",
      padding: "2px 7px", borderRadius: 99, background: colors[mode] ?? colors.onsite,
      color: "var(--tm-text-muted)", textTransform: "uppercase",
    }}>
      {labels[mode] ?? mode}
    </span>
  )
}

export function JobDrillPanel({
  companyName,
  skillName,
  drillJobs,
  isLoading,
  savedJobIds,
  onSave,
  onClose,
  isLoggedIn,
}: {
  companyName: string
  skillName: string
  drillJobs: JobSearchItem[]
  isLoading: boolean
  savedJobIds: Set<string>
  onSave: (job: JobSearchItem) => void
  onClose: () => void
  isLoggedIn: boolean
}) {
  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", marginTop: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-interactive)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{companyName}</span>
          <span style={{ color: "var(--tm-text-faint)", fontSize: 11 }}>x</span>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{skillName}</span>
          {!isLoading ? <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, color: "var(--tm-text-faint)" }}>/ {drillJobs.length} jobs</span> : null}
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)", padding: "4px 12px", color: "var(--tm-interactive-rest)", fontSize: 12, cursor: "pointer", fontFamily: "var(--tm-font-mono)" }}>
          Close
        </button>
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {isLoading ? (
          <div style={{ padding: 24, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 12 }}>Loading jobs...</div>
        ) : drillJobs.length === 0 ? (
          <div style={{ padding: 24, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 12 }}>No jobs found for this combination.</div>
        ) : (
          drillJobs.map((job, idx) => {
            const isSaved = savedJobIds.has(job.job_id)
            const jobLocation = formatJobLocation({ city: job.location_city, country: job.location_country })
            return (
              <div key={job.job_id} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 20px", borderBottom: idx < drillJobs.length - 1 ? "1px solid var(--tm-border-soft)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 9, color: "var(--tm-text-faint)", letterSpacing: "0.06em", marginBottom: 2 }}>{job.job_id.slice(0, 8).toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.job_title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                    {jobLocation ? <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{jobLocation}</span> : null}
                    <LocationBadge mode={job.location_mode} />
                  </div>
                  {job.job_description ? <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 6, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{job.job_description}</div> : null}
                </div>
                {isLoggedIn ? (
                  <button onClick={() => onSave(job)} disabled={isSaved} style={{ flexShrink: 0, fontSize: 11, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em", padding: "5px 14px", borderRadius: "var(--tm-radius-sm)", cursor: isSaved ? "default" : "pointer", background: isSaved ? "var(--tm-int-bg-wash)" : "transparent", border: `1px solid ${isSaved ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`, color: isSaved ? "var(--tm-interactive)" : "var(--tm-text-muted)" }}>
                    {isSaved ? "Saved" : "Save"}
                  </button>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
