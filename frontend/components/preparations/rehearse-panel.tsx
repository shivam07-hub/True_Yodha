"use client"

/**
 * RehearsePanel — the coverage panel re-projected as interview Q&A (grill Q3).
 *
 * Each requirement becomes the question a hiring manager would ask of it; the
 * user's own banked story sits underneath as the answer skeleton. Deterministic
 * projection — no LLM, no fabrication: a requirement with no story shows an
 * honest "no story yet" line pointing back at the coverage panel.
 */

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { cv as cvApi, type CoverageRow } from "@/lib/api"

/** "Own enterprise quota planning" → "Tell me about a time you owned enterprise
 *  quota planning." Deterministic phrasing — same words the JD used. */
export function toInterviewQuestion(requirement: string): string {
  const req = requirement.trim().replace(/[.!]+$/, "")
  if (!req) return ""
  const lower = req.charAt(0).toLowerCase() + req.slice(1)
  return `Tell me about a time you ${lower}.`
}

export function RehearsePanel({ token, jobId }: { token: string; jobId: string }) {
  // Shares the coverage cache with CoveragePanel — one query key, no second fetch.
  const coverage = useQuery({
    queryKey: ["jd-coverage", jobId],
    queryFn: () => cvApi.career.jdCoverage(token, jobId),
    enabled: !!token && !!jobId,
    staleTime: 5 * 60 * 1000,
  })

  const rows: CoverageRow[] = coverage.data?.requirements ?? []
  if (coverage.isLoading) return <p className="prp-quiet">Preparing your rehearsal…</p>
  if (rows.length === 0) return <p className="prp-quiet">No requirements read yet. Read the full job below.</p>

  // Strongest answers first: covered → weak → gap.
  const order = { covered: 0, weak: 1, gap: 2 } as const
  const sorted = [...rows].sort(
    (a, b) => (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2),
  )

  return (
    <div>
      {sorted.map((row) => (
        <div key={row.requirement} className="prp-reh">
          <div className="prp-reh-q">{toInterviewQuestion(row.requirement)}</div>
          {row.story_title ? (
            <div className="prp-reh-a">
              Lead with <b>{row.story_title}</b>
              {row.story_pointer ? <> — &ldquo;{row.story_pointer}&rdquo;</> : null}
            </div>
          ) : (
            <div className="prp-reh-none">No story banked yet — answer it in the coverage panel above.</div>
          )}
        </div>
      ))}
    </div>
  )
}
