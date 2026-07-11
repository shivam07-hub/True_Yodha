"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import type { OtherRole } from "./lens-company"

/**
 * MoreRoles — the company's other openings as a COLLECT list, not a browse
 * list. One tap saves the role to Collections (optimistic — the ✓ lands
 * before the network), so the user gathers siblings without ever leaving the
 * CV path of the job they're on. Rows already in Collections show their fit
 * and jump to that job's drawer instead.
 */
export function MoreRoles({
  company,
  currentJobId,
  token,
  otherRoles,
  onJump,
}: {
  company: string | null
  currentJobId: string
  token: string
  /** Sibling roles already in the user's collection (fit-annotated). */
  otherRoles: OtherRole[]
  onJump?: (jobId: string) => void
}) {
  const qc = useQueryClient()
  const [saved, setSaved] = React.useState<Set<string>>(new Set())
  const [justSaved, setJustSaved] = React.useState<string | null>(null)

  const openings = useQuery({
    queryKey: ["company-jobs", company],
    queryFn: () => jobsApi.companyJobs(company!),
    enabled: !!company,
    staleTime: 30 * 60 * 1000,
  })

  const inCollection = React.useMemo(
    () => new Set(otherRoles.map((r) => r.jobId)),
    [otherRoles],
  )

  const discoverable = (openings.data?.jobs ?? []).filter(
    (j) => j.job_id !== currentJobId && !inCollection.has(j.job_id),
  )

  const save = (jobId: string) => {
    // Optimistic: the ✓ + pop land on the tap; a failed save quietly reverts.
    setSaved((prev) => new Set(prev).add(jobId))
    setJustSaved(jobId)
    window.setTimeout(() => setJustSaved((cur) => (cur === jobId ? null : cur)), 320)
    jobsApi
      .saveJob(token, jobId)
      .then(() => {
        void qc.invalidateQueries({ queryKey: dataKeys.applications() })
      })
      .catch(() => {
        setSaved((prev) => {
          const next = new Set(prev)
          next.delete(jobId)
          return next
        })
      })
  }

  const rows = [
    ...otherRoles.slice(0, 4).map((r) => ({
      jobId: r.jobId,
      role: r.role,
      kind: "collected" as const,
      fit: r.fit,
    })),
    ...discoverable.slice(0, Math.max(0, 5 - Math.min(otherRoles.length, 4))).map((j) => ({
      jobId: j.job_id,
      role: j.title,
      kind: "open" as const,
      fit: null as number | null,
    })),
  ]

  if (rows.length === 0) return null

  return (
    <>
      <span className="db-label">More roles</span>
      {rows.map((r) => {
        const isSaved = r.kind === "collected" || saved.has(r.jobId)
        const canJump = r.kind === "collected" && !!onJump
        return (
          <button
            key={r.jobId}
            type="button"
            className={`db-otherrole${justSaved === r.jobId ? " db-just-saved" : ""}`}
            aria-label={
              isSaved ? `${r.role} — in Collections` : `Save ${r.role} to Collections`
            }
            onClick={() => {
              if (canJump) onJump?.(r.jobId)
              else if (!isSaved) save(r.jobId)
            }}
          >
            <span>{r.role}</span>
            {r.kind === "collected" && r.fit != null ? (
              <span className="fit">{r.fit}% fit</span>
            ) : isSaved ? (
              <span className="db-orstate on">✓ Saved</span>
            ) : (
              <span className="db-orstate">+ Save</span>
            )}
          </button>
        )
      })}
    </>
  )
}
