"use client"

/**
 * CoveragePanel — "what this job wants" vs the user's banked stories (Lane C).
 *
 * The applied-room return engine (grill Q2): every requirement is covered /
 * weak / gap; a gap opens ONE question whose answer becomes a NEW career story
 * via the dump pipeline — banked for this interview and every future one.
 * Requirements are server-cached per (user, job) so they never shuffle between
 * visits; "Recheck" recomputes after new stories land.
 */

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { cv as cvApi, type CoverageRow } from "@/lib/api"

const MARKER: Record<string, { glyph: string; cls: string }> = {
  covered: { glyph: "●", cls: "covered" },
  weak: { glyph: "◐", cls: "weak" },
  gap: { glyph: "○", cls: "gap" },
}

function GapComposer({
  requirement, onBank, banking,
}: { requirement: string; onBank: (answer: string) => void; banking: boolean }) {
  const [value, setValue] = React.useState("")
  const tooShort = value.trim().replace(/\s/g, "").length < 12
  return (
    <div className="prp-gapq">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tell it like you'd tell a colleague — what you did, roughly when, and what came of it."
        aria-label={`Your experience with: ${requirement}`}
      />
      <div className="prp-gapq-foot">
        <span className="prp-gapq-hint">Saved as a career story — reusable in your CV and every interview.</span>
        <button
          type="button"
          className="prp-btn primary"
          disabled={tooShort || banking}
          onClick={() => onBank(value)}
        >
          {banking ? "Banking…" : "Bank it"}
        </button>
      </div>
    </div>
  )
}

export function CoveragePanel({ token, jobId }: { token: string; jobId: string }) {
  const queryClient = useQueryClient()
  const [openGap, setOpenGap] = React.useState<string | null>(null)
  // Requirements answered this visit — the story lands async via the dump
  // pipeline (same "Reading your dump" contract as Stories), so the row shows
  // "banked" now and flips to covered on the next recheck.
  const [banked, setBanked] = React.useState<Set<string>>(new Set())

  const coverage = useQuery({
    queryKey: ["jd-coverage", jobId],
    queryFn: () => cvApi.career.jdCoverage(token, jobId),
    enabled: !!token && !!jobId,
    staleTime: 5 * 60 * 1000,
  })

  const recheck = useMutation({
    mutationFn: () => cvApi.career.jdCoverage(token, jobId, { refresh: true }),
    onSuccess: (data) => {
      queryClient.setQueryData(["jd-coverage", jobId], data)
      setBanked(new Set())
    },
  })

  const bank = useMutation({
    mutationFn: ({ requirement, answer }: { requirement: string; answer: string }) =>
      cvApi.career.jdCoverageAnswer(token, requirement, answer, jobId),
    onSuccess: (_res, vars) => {
      setBanked((prev) => new Set(prev).add(vars.requirement))
      setOpenGap(null)
    },
  })

  if (coverage.isLoading) {
    return <p className="prp-quiet">Reading what this job wants…</p>
  }
  const rows: CoverageRow[] = coverage.data?.requirements ?? []
  if (coverage.isError || rows.length === 0) {
    return (
      <p className="prp-quiet">
        Couldn&rsquo;t read this job&rsquo;s requirements yet.{" "}
        <button type="button" className="prp-req-action" onClick={() => recheck.mutate()} disabled={recheck.isPending}>
          {recheck.isPending ? "Reading…" : "Try again"}
        </button>
      </p>
    )
  }

  const doneCount = rows.filter((r) => r.status === "covered" || banked.has(r.requirement)).length

  return (
    <div>
      <div className="prp-cov-bar">
        <span className="prp-cov-num">{doneCount}/{rows.length} covered</span>
        <div className="prp-cov-track" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={rows.length}>
          <div className="prp-cov-fill" style={{ width: `${(doneCount / rows.length) * 100}%` }} />
        </div>
        <button
          type="button"
          className="prp-req-action"
          onClick={() => recheck.mutate()}
          disabled={recheck.isPending}
          title="Re-match requirements against your latest stories"
        >
          {recheck.isPending ? "Rechecking…" : "Recheck"}
        </button>
      </div>

      {rows.map((row) => {
        const isBanked = banked.has(row.requirement)
        const marker = MARKER[isBanked ? "covered" : row.status] ?? MARKER.gap
        const isOpen = openGap === row.requirement
        return (
          <div key={row.requirement} className="prp-req">
            <span className={`prp-req-marker ${marker.cls}`} aria-hidden>{marker.glyph}</span>
            <div className="prp-req-main">
              <div className="prp-req-text">{row.requirement}</div>
              {row.status !== "gap" && row.story_title ? (
                <div className="prp-req-story">
                  <b>{row.story_title}</b>
                  {row.story_pointer ? <> — {row.story_pointer}</> : null}
                </div>
              ) : null}
              {isOpen && !isBanked ? (
                <GapComposer
                  requirement={row.requirement}
                  banking={bank.isPending}
                  onBank={(answer) => bank.mutate({ requirement: row.requirement, answer })}
                />
              ) : null}
              {isOpen && bank.isError ? (
                <p className="prp-err">Couldn&rsquo;t save that — try again.</p>
              ) : null}
            </div>
            {isBanked ? (
              <span className="prp-req-banked">✓ banked</span>
            ) : row.status === "gap" ? (
              <button
                type="button"
                className="prp-req-action"
                onClick={() => setOpenGap(isOpen ? null : row.requirement)}
              >
                {isOpen ? "Close" : "Answer it"}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
