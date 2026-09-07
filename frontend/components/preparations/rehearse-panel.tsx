"use client"

/**
 * RehearsePanel — step 3 of the ladder (grill Q3; Unified Prep v2, 2b).
 *
 * Each requirement becomes the question a hiring manager would ask of it; the
 * user's own banked story sits underneath as the answer skeleton. Deterministic
 * projection — no LLM, no fabrication: a requirement with no story shows an
 * honest "no story yet" line pointing back at step 1.
 *
 * It records against the STORY, not the job. Myro is one platform: rehearsing
 * "the Kotak 811 relaunch" out loud is something the person did, and it does
 * not become un-done because the next room is at a different company. Every
 * room's coverage already maps its requirements to story ids, so marking one
 * here clears it in every room that leans on the same story — which is what
 * the rail's headline has been promising all along.
 *
 * A requirement with no story has no Mark button. There is nothing to say yet;
 * the server would refuse it, and a control that does nothing is worse than no
 * control.
 */

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { cv as cvApi, preparations, type CoverageRow, type RehearsalState } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/** JD requirements come in two grammatical shapes, and one frame cannot hold
 *  both. `jd_coverage` asks the model for "requirement phrases as the JOB
 *  states them", which yields verb phrases ("Lead cross-functional programme
 *  delivery") AND noun phrases ("Senior stakeholder management up to executive
 *  committee level"). Prefixing every one with "Tell me about a time you"
 *  produced "a time you senior stakeholder management up to executive committee
 *  level" — visible broken English on the panel's primary content.
 *
 *  Two frames, chosen on the first word, and neither needs conjugating (which
 *  is where the irregular verbs would have got us): "a time you HAD TO lead…"
 *  and "your experience WITH senior stakeholder management…". Same words the
 *  JD used, either way. */
const VERB_STARTS = new Set([
  "lead", "own", "manage", "build", "drive", "deliver", "run", "develop",
  "design", "define", "create", "execute", "support", "maintain", "coordinate",
  "oversee", "partner", "collaborate", "analyse", "analyze", "report",
  "present", "negotiate", "handle", "implement", "improve", "optimise",
  "optimize", "scale", "launch", "ship", "grow", "hire", "mentor", "train",
  "plan", "prioritise", "prioritize", "communicate", "engage", "translate",
  "monitor", "track", "review", "ensure", "establish", "identify", "resolve",
  "work", "collect", "conduct", "provide", "prepare", "produce", "set",
])

export function toInterviewQuestion(requirement: string): string {
  const req = requirement.trim().replace(/[.!]+$/, "")
  if (!req) return ""
  const lower = req.charAt(0).toLowerCase() + req.slice(1)
  const first = lower.split(/[\s,/]+/)[0]?.toLowerCase() ?? ""
  return VERB_STARTS.has(first)
    ? `Tell me about a time you had to ${lower}.`
    : `Tell me about your experience with ${lower}.`
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
    mutationFn: (v: { storyId: string; rehearsed: boolean }) =>
      preparations.setRehearsal(token, jobId, v.storyId, v.rehearsed),
    onSuccess: (next: RehearsalState) => {
      queryClient.setQueryData(dataKeys.prepRehearsal(jobId), next)
      // The pip in the rail and the ring in the room read the ladder, not this.
      // Without the invalidate they keep the old step until a reload.
      void queryClient.invalidateQueries({ queryKey: dataKeys.prepLadder() })
    },
  })

  const rows: CoverageRow[] = coverage.data?.requirements ?? []
  const done = new Set(state.data?.rehearsed ?? [])

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
  const total = state.data?.total ?? rows.filter((r) => r.story_id).length

  return (
    <div>
      <p className="prp-reh-count">
        {answered} of {total} worked
        {total > 0 && answered >= total ? " — step 3 clear" : ""}
      </p>
      {/* The carry is the whole point and it is invisible from inside one room:
          nothing on this screen can show that marking here moved 3M too. This
          is the one sentence that earns its place. */}
      <p className="prp-reh-carry">
        Rehearse a story once. It counts in every room that asks for it.
      </p>
      {sorted.map((row) => {
        const storyId = row.story_id ?? ""
        const marked = !!storyId && done.has(storyId)
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
            {storyId ? (
              <button
                type="button"
                className="prp-reh-mark tm-control-focus"
                aria-pressed={marked}
                disabled={save.isPending}
                onClick={() => save.mutate({ storyId, rehearsed: !marked })}
              >
                <Check size={13} aria-hidden />
                {marked ? "Rehearsed" : "Mark rehearsed"}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
