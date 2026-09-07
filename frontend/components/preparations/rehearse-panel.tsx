"use client"

/**
 * RehearsePanel — step 3 of the ladder (grill Q3; Unified Prep v2, 2b).
 *
 * Each requirement becomes the question a hiring manager would ask of it; the
 * user's own banked story sits underneath as the answer skeleton. Deterministic
 * projection — no LLM, no fabrication: a requirement with no story shows an
 * honest "no story yet" line pointing back at step 1.
 *
 * It now RECORDS. Until 2026-09-06 this panel wrote nothing, so the ladder read
 * step 3 as "not started" for everyone forever — and a step that can never be
 * cleared is a step nobody works. Marking a question sends the whole set, so
 * two quick taps cannot race, and the server answers with the state it holds.
 */

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { cv as cvApi, preparations, type CoverageRow, type RehearsalState } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/** "Own enterprise quota planning" → "Tell me about a time you owned enterprise
 *  quota planning." Deterministic phrasing — same words the JD used. */
export function toInterviewQuestion(requirement: string): string {
  const req = requirement.trim().replace(/[.!]+$/, "")
  if (!req) return ""
  const lower = req.charAt(0).toLowerCase() + req.slice(1)
  return `Tell me about a time you ${lower}.`
}

export function RehearsePanel({ token, jobId }: { token: string; jobId: string }) {
  const queryClient = useQueryClient()

  // Shares the coverage cache with CoveragePanel — one query key, no second fetch.
  const coverage = useQuery({
    queryKey: ["jd-coverage", jobId],
    queryFn: () => cvApi.career.jdCoverage(token, jobId),
    enabled: !!token && !!jobId,
    staleTime: 5 * 60 * 1000,
  })
  const state = useQuery({
    queryKey: dataKeys.prepRehearsal(jobId),
    queryFn: () => preparations.rehearsal(token, jobId),
    enabled: !!token && !!jobId,
    staleTime: 60 * 1000,
  })

  const save = useMutation({
    mutationFn: (rehearsed: string[]) => preparations.setRehearsal(token, jobId, rehearsed),
    onSuccess: (next: RehearsalState) => {
      queryClient.setQueryData(dataKeys.prepRehearsal(jobId), next)
      // The pip in the rail and the ring in the room read the ladder, not this.
      // Without the invalidate they keep the old step until a reload.
      void queryClient.invalidateQueries({ queryKey: dataKeys.prepLadder() })
    },
  })

  const rows: CoverageRow[] = coverage.data?.requirements ?? []
  const done = new Set((state.data?.rehearsed ?? []).map((r) => r.trim().toLowerCase()))

  function toggle(requirement: string) {
    const key = requirement.trim().toLowerCase()
    const current = state.data?.rehearsed ?? []
    const next = done.has(key)
      ? current.filter((r) => r.trim().toLowerCase() !== key)
      : [...current, requirement]
    save.mutate(next)
  }

  if (coverage.isLoading) return <p className="prp-quiet">Preparing your rehearsal…</p>
  if (rows.length === 0) {
    return (
      <p className="prp-quiet">
        No requirements read yet — clear step 1 and these questions write themselves.
      </p>
    )
  }

  // Strongest answers first: covered → weak → gap.
  const order = { covered: 0, weak: 1, gap: 2 } as const
  const sorted = [...rows].sort(
    (a, b) => (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2),
  )
  const answered = state.data?.answered ?? 0

  return (
    <div>
      <p className="prp-reh-count">
        {answered} of {rows.length} worked
        {answered >= rows.length && rows.length > 0 ? " — step 3 clear" : ""}
      </p>
      {sorted.map((row) => {
        const marked = done.has(row.requirement.trim().toLowerCase())
        return (
          <div key={row.requirement} className={marked ? "prp-reh is-done" : "prp-reh"}>
            <div className="prp-reh-main">
              <div className="prp-reh-q">{toInterviewQuestion(row.requirement)}</div>
              {row.story_title ? (
                <div className="prp-reh-a">
                  Lead with <b>{row.story_title}</b>
                  {row.story_pointer ? <> — &ldquo;{row.story_pointer}&rdquo;</> : null}
                </div>
              ) : (
                <div className="prp-reh-none">No story banked yet — answer it in step 1.</div>
              )}
            </div>
            <button
              type="button"
              className="prp-reh-mark tm-control-focus"
              aria-pressed={marked}
              disabled={save.isPending}
              onClick={() => toggle(row.requirement)}
            >
              <Check size={13} aria-hidden />
              {marked ? "Rehearsed" : "Mark rehearsed"}
            </button>
          </div>
        )
      })}
    </div>
  )
}
