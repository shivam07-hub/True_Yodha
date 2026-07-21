"use client"

/**
 * BriefCard — the day-of brief, the room's ONE paid artifact (grill Q5:
 * 30 coins, charge-on-success, replay free; everything that builds the habit
 * stays free). Grounded on the JD + the user's own stories — never invented
 * company facts (ADR-0016).
 */

import * as React from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type PrepBrief } from "@/lib/api"
import { useCoinsGate } from "@/lib/hooks/use-xp-gate"
import { useXPStore } from "@/store/xpStore"

const BRIEF_COST = 30

function BriefView({ brief }: { brief: PrepBrief }) {
  return (
    <div className="prp-brief-body">
      <p>{brief.snapshot}</p>

      {brief.leads.length > 0 && (
        <>
          <h4>Lead with</h4>
          <ul>
            {brief.leads.map((lead) => (
              <li key={lead.story}>
                <b>{lead.story}</b>
                {lead.why ? <> — {lead.why}</> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Likely questions</h4>
      <ul>
        {brief.likely_questions.map((q) => <li key={q}>{q}</li>)}
      </ul>

      {brief.plan.length > 0 && (
        <>
          <h4>Your plan</h4>
          <ul>
            {brief.plan.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </>
      )}

      {brief.watch_out ? <div className="prp-brief-watch">{brief.watch_out}</div> : null}
    </div>
  )
}

export function BriefCard({ token, jobId }: { token: string; jobId: string }) {
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const gate = useCoinsGate({ cost: BRIEF_COST, action: "prep_brief" })

  // Purchased-state (no charge) → "view" vs "get · 30".
  const state = useQuery({
    queryKey: ["prep-brief", jobId],
    queryFn: () => jobsApi.getPrepBrief(token, jobId),
    enabled: !!token && !!jobId,
    staleTime: 5 * 60 * 1000,
  })

  const buy = useMutation({
    mutationFn: () => jobsApi.createPrepBrief(token, jobId),
    onSuccess: (res) => {
      if (typeof res.new_coin_balance === "number") {
        applyXpChange({ newBalance: res.new_coin_balance, action: "prep_brief" })
      }
      void state.refetch()
    },
  })

  const brief = state.data?.brief ?? buy.data?.brief ?? null

  if (brief) return <BriefView brief={brief} />

  return (
    <div>
      <p className="prp-sec-note" style={{ marginBottom: 10 }}>
        Your stories, their likely questions, a day-of plan — one page.
      </p>
      <button
        type="button"
        className="prp-btn primary"
        disabled={buy.isPending || state.isLoading}
        onClick={() => gate.attempt(() => buy.mutate())}
      >
        {buy.isPending ? "Writing your brief…" : `Get the day-of brief · ${BRIEF_COST}`}
      </button>
      {buy.isError ? <p className="prp-err" style={{ marginTop: 8 }}>Couldn&rsquo;t build the brief right now — nothing was charged. Try again.</p> : null}
    </div>
  )
}
