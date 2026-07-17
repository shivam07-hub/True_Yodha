/**
 * TailorWeave — "Tailor with Mentor", the draft-first whole-CV tailor for one
 * job (grill locks 2026-07-16, memory project_tailor_weave_mentor).
 *
 * One overlay, four acts:
 *   brief     — what Mentor will do + what the job asks (free, instant)
 *   interview — ONLY the unproven asks, one at a time, with mined candidates
 *               from the user's own stories/CV (tap to confirm, or free-write;
 *               ONE skippable probe on a thin answer)
 *   loom      — the weave runs; the WeaveLoom narrates the real work
 *   review    — per-ROLE accept (Keep mine / Take this), then save → the
 *               job-tailored version. Living master untouched.
 *
 * Money: 50 coins per weave RUN, charged on delivery; a purchased proposal
 * replays free (act jumps straight to review). Supersedes MentorWalk here.
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { cv as cvApi, type WeaveProposal, type WeaveQuestion } from "@/lib/api"
import { useXPStore } from "@/store/xpStore"
import { Icon } from "./icons"
import { MentorThinking, WeaveLoom } from "./mentor-thinking"
import { WeaveRoleCard } from "./weave-role-card"

type Act = "brief" | "interview" | "loom" | "review" | "done"

interface TailorWeaveProps {
  token: string
  jobId: string
  company: string
  jobTitle: string
  /** Role labels for the loom narration (from the CV's experience blocks). */
  loomRoles: string[]
  cost?: number
  onApplied: (versionId: number) => void
  onClose: () => void
}

function optionSentence(kind: "story" | "cv", label: string, detail: string): string {
  if (kind === "cv") return `It's on my CV already: "${label}"`
  return detail ? `That was my "${label}" work — ${detail}` : `That was my "${label}" work.`
}

export function TailorWeave({
  token, jobId, company, jobTitle, loomRoles, cost = 50, onApplied, onClose,
}: TailorWeaveProps) {
  const [act, setAct] = useState<Act>("brief")
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<WeaveProposal | null>(null)
  const [stale, setStale] = useState(false)
  const applyXpChange = useXPStore(s => s.applyXpChange)

  // Interview state
  const [qIdx, setQIdx] = useState(0)
  const [draft, setDraft] = useState("")
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [probe, setProbe] = useState<string | null>(null)
  const [answers, setAnswers] = useState<{ requirement: string; text: string }[]>([])

  // Review state
  const [rIdx, setRIdx] = useState(0)
  const [taken, setTaken] = useState<Record<number, boolean>>({})
  const [keepSummary, setKeepSummary] = useState(true)
  const [keepSkills, setKeepSkills] = useState(true)
  const [savedVersion, setSavedVersion] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // A purchased proposal replays free — jump straight to review.
  const existing = useQuery({
    queryKey: ["cv-weave", jobId],
    queryFn: () => cvApi.weave.get(token, jobId),
    staleTime: 30_000,
  })
  useEffect(() => {
    if (!existing.data || proposal) return
    if (existing.data.purchased && existing.data.proposal) {
      setProposal(existing.data.proposal)
      setStale(existing.data.stale)
      setAct(existing.data.stale ? "brief" : "review")
    }
  }, [existing.data, proposal])

  const interview = useQuery({
    queryKey: ["cv-weave-interview", jobId],
    queryFn: () => cvApi.weave.interview(token, jobId),
    enabled: act === "brief",
    staleTime: 60_000,
    retry: 1,
  })
  const questions: WeaveQuestion[] = interview.data?.questions ?? []

  const runWeave = useMutation({
    mutationFn: (opts: { refresh: boolean }) => cvApi.weave.run(token, jobId, answers, opts),
    onMutate: () => { setError(null); setAct("loom") },
    onSuccess: res => {
      if (res.new_coin_balance != null && !res.cached) {
        applyXpChange({ newBalance: res.new_coin_balance, action: "cv_weave" })
      }
      setProposal(res.proposal)
      setStale(res.stale)
      setRIdx(0); setTaken({})
      setAct("review")
    },
    onError: (e: Error) => { setError(e.message); setAct("brief") },
  })

  const bankAnswer = useMutation({
    mutationFn: (body: { requirement: string; answer: string; final: boolean }) =>
      cvApi.weave.answer(token, { requirement: body.requirement, answer: body.answer, jobId, final: body.final }),
  })

  const applyWeave = useMutation({
    mutationFn: (accepted: number[]) =>
      cvApi.weave.apply(token, jobId, accepted, { acceptSummary: keepSummary, acceptSkillsLine: keepSkills }),
    onSuccess: res => { setSavedVersion(res.version_id); onApplied(res.version_id); setAct("done") },
    onError: (e: Error) => setError(e.message),
  })

  const changedRoles = useMemo(() => (proposal?.roles ?? []).filter(r => r.changed), [proposal])
  const guardedCount = useMemo(() => (proposal?.roles ?? []).filter(r => r.guarded).length, [proposal])
  const hasExtras = !!(proposal?.summary || proposal?.skills_line)
  const onSavePanel = act === "review" && rIdx >= changedRoles.length

  const loomLines = useMemo(() => [
    "Reading the job's language",
    "Matching your banked stories",
    ...loomRoles.slice(0, 4).map(r => `Weaving ${r}`),
    "Checking every number survives",
  ], [loomRoles])

  function advanceInterview() {
    setDraft(""); setProbe(null); setPicked(new Set())
    if (qIdx >= questions.length - 1) runWeave.mutate({ refresh: stale })
    else setQIdx(i => i + 1)
  }
  // Multi-select: the picked options (any that fit) plus any free-text elaboration
  // compose ONE grounded answer — Mentor weaves them together.
  function composedAnswer(): string {
    const cur = questions[qIdx]
    const parts = cur
      ? Array.from(picked).sort((a, b) => a - b)
          .filter(i => cur.options[i])
          .map(i => optionSentence(cur.options[i].kind, cur.options[i].label, cur.options[i].detail))
      : []
    const free = draft.trim()
    if (free) parts.push(free)
    return parts.join(" ")
  }
  function submitAnswer() {
    const text = composedAnswer()
    const q = questions[qIdx]
    if (!q || text.length < 12 || bankAnswer.isPending) return
    const final = probe != null
    bankAnswer.mutate({ requirement: q.requirement, answer: text, final }, {
      onSuccess: res => {
        if (res.follow_up && !final) { setProbe(res.follow_up); return }
        setAnswers(prev => [...prev, { requirement: q.requirement, text }])
        advanceInterview()
      },
      onError: () => {
        // Banking is enrichment, not a gate — the answer still grounds THIS weave.
        setAnswers(prev => [...prev, { requirement: q.requirement, text }])
        advanceInterview()
      },
    })
  }

  const q = questions[qIdx]
  const startLabel = questions.length > 0 ? "Start" : `Tailor now · ${cost} coins`

  return (
    <div className="tw-backdrop" role="dialog" aria-modal="true" aria-label="Tailor with Mentor" onClick={onClose}>
      <div className="tw-modal" data-act={act} onClick={e => e.stopPropagation()}>
        <div className="tw-head">
          <span className="tw-head-title"><Icon name="sparkle" size={14} className="tw-spark" /> Tailor with Mentor</span>
          <span className="tw-head-job">{jobTitle || "This job"} · {company}</span>
          <button type="button" className="tw-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="tw-stage">
          {act === "brief" && (
            <div className="tw-brief">
              <h2 className="tw-brief-h">Tailor this CV for {company}</h2>
              <p className="tw-brief-p">
                Mentor reworks each role to speak this job&rsquo;s language — every number
                and name kept. You accept each role before anything lands.
              </p>
              {interview.isLoading ? (
                <div className="tw-brief-reading"><MentorThinking size={28} /> Reading what this job wants…</div>
              ) : interview.data ? (
                <div className="tw-brief-stats">
                  <span><b>{interview.data.requirements_total}</b> asks in this job</span>
                  {interview.data.unproven > 0 && (
                    <span><b>{interview.data.unproven}</b> need your word first</span>
                  )}
                </div>
              ) : null}
              {stale && proposal && (
                <p className="tw-note">Your CV changed since the last draft — a fresh run replaces it.</p>
              )}
              {error && <p className="tw-err" role="alert">{error}</p>}
              <div className="tw-brief-actions">
                <button
                  type="button" className="tw-btn tw-btn-primary"
                  disabled={interview.isLoading || runWeave.isPending}
                  onClick={() => {
                    setError(null)
                    if (questions.length > 0) { setQIdx(0); setAct("interview") }
                    else runWeave.mutate({ refresh: stale })
                  }}
                >
                  {startLabel}
                </button>
                {stale && proposal && (
                  <button type="button" className="tw-btn tw-btn-ghost" onClick={() => { setStale(false); setAct("review") }}>
                    View old draft
                  </button>
                )}
                <button type="button" className="tw-btn tw-btn-ghost" onClick={onClose}>Not now</button>
              </div>
              {questions.length > 0 && (
                <p className="tw-brief-cost">Weave runs after your answers · {cost} coins</p>
              )}
            </div>
          )}

          {act === "interview" && q && (
            <div className="tw-int">
              <div className="tw-int-count mono">{qIdx + 1} / {questions.length}</div>
              <span className="tw-int-status" data-v={q.status}>{q.status === "weak" ? "Thin on your CV" : "Missing"}</span>
              <h2 className="tw-int-req">{q.requirement}</h2>
              {q.options.length > 0 && !probe && (
                <div className="tw-opts">
                  <p className="tw-opts-label">Pick any that fit — Myro weaves them together. Add your own below.</p>
                  {q.options.map((o, i) => (
                    <button
                      key={i} type="button" className="tw-opt"
                      data-picked={picked.has(i)} aria-pressed={picked.has(i)}
                      onClick={() => setPicked(prev => {
                        const next = new Set(prev)
                        if (next.has(i)) next.delete(i)
                        else next.add(i)
                        return next
                      })}
                    >
                      <span className="tw-opt-check" aria-hidden="true">{picked.has(i) ? "✓" : ""}</span>
                      <span className="tw-opt-body">
                        <span className="tw-opt-kind mono">{o.kind === "cv" ? "on your CV" : "your story"}</span>
                        <span className="tw-opt-label">{o.label}</span>
                        {o.detail && o.kind !== "cv" && <span className="tw-opt-detail">{o.detail}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {probe && (
                <p className="tw-probe"><Icon name="sparkle" size={12} /> {probe}</p>
              )}
              <textarea
                className="tw-composer"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="In your words — what you did, and what came of it."
                rows={4}
              />
              <p className="tw-int-hint mono">Myro shapes your words — it never invents numbers.</p>
              <div className="tw-int-actions">
                <button
                  type="button" className="tw-btn tw-btn-primary"
                  disabled={(picked.size === 0 && draft.trim().length < 12) || bankAnswer.isPending}
                  onClick={submitAnswer}
                >
                  {bankAnswer.isPending ? <MentorThinking size={16} /> : null}
                  {probe ? "That's everything" : "That's it"}
                </button>
                <button type="button" className="tw-btn tw-btn-ghost" onClick={advanceInterview}>
                  {qIdx >= questions.length - 1 ? `Skip & weave · ${cost}` : "Skip"}
                </button>
              </div>
            </div>
          )}

          {act === "loom" && <WeaveLoom lines={loomLines} settled={!runWeave.isPending} />}

          {act === "review" && proposal && !onSavePanel && changedRoles[rIdx] && (
            <div className="tw-review">
              <div className="tw-review-strip mono" aria-label="Roles">
                {changedRoles.map((r, i) => (
                  <span key={r.role_index} className="tw-review-dot" data-state={i < rIdx ? "done" : i === rIdx ? "now" : "todo"} />
                ))}
                <span className="tw-review-count">{rIdx + 1} / {changedRoles.length} roles</span>
              </div>
              <WeaveRoleCard role={changedRoles[rIdx]} />
              <div className="tw-review-actions">
                <button
                  type="button" className="tw-btn tw-btn-ghost"
                  onClick={() => { setTaken(t => ({ ...t, [changedRoles[rIdx].role_index]: false })); setRIdx(i => i + 1) }}
                >Keep mine</button>
                <button
                  type="button" className="tw-btn tw-btn-primary"
                  onClick={() => { setTaken(t => ({ ...t, [changedRoles[rIdx].role_index]: true })); setRIdx(i => i + 1) }}
                >Take this</button>
              </div>
              {rIdx > 0 && (
                <button type="button" className="tw-back" onClick={() => setRIdx(i => Math.max(0, i - 1))}>← Back</button>
              )}
            </div>
          )}

          {act === "review" && proposal && onSavePanel && (
            <div className="tw-save">
              <h2 className="tw-brief-h">Ready to save</h2>
              <p className="tw-brief-p">
                {Object.values(taken).filter(Boolean).length} of {changedRoles.length} roles reworked
                {guardedCount > 0 && <> · {guardedCount} kept as-is by the honesty check</>}
                . Saves as your {company} CV — your master stays untouched.
              </p>
              {hasExtras && (
                <div className="tw-extras">
                  {proposal.summary && (
                    <label className="tw-extra">
                      <input type="checkbox" checked={keepSummary} onChange={e => setKeepSummary(e.target.checked)} />
                      <span><b>New opening summary</b><em>{proposal.summary}</em></span>
                    </label>
                  )}
                  {proposal.skills_line && (
                    <label className="tw-extra">
                      <input type="checkbox" checked={keepSkills} onChange={e => setKeepSkills(e.target.checked)} />
                      <span><b>Skills line</b><em>{proposal.skills_line}</em></span>
                    </label>
                  )}
                </div>
              )}
              {error && <p className="tw-err" role="alert">{error}</p>}
              <div className="tw-brief-actions">
                <button
                  type="button" className="tw-btn tw-btn-primary"
                  disabled={applyWeave.isPending}
                  onClick={() => applyWeave.mutate(
                    Object.entries(taken).filter(([, v]) => v).map(([k]) => Number(k)),
                  )}
                >
                  {applyWeave.isPending ? "Saving…" : "Save tailored CV"}
                </button>
                {changedRoles.length > 0 && (
                  <button type="button" className="tw-btn tw-btn-ghost" onClick={() => setRIdx(0)}>Review again</button>
                )}
                {error && (
                  <button type="button" className="tw-btn tw-btn-ghost" onClick={() => runWeave.mutate({ refresh: true })}>
                    Re-run · {cost} coins
                  </button>
                )}
              </div>
            </div>
          )}

          {act === "done" && (
            <div className="tw-done">
              <div className="tw-done-badge">✓</div>
              <h2 className="tw-brief-h">Saved — your {company} CV</h2>
              <p className="tw-brief-p">
                Every line traces to your real experience. The stories you added are
                banked for every future job.
              </p>
              <button type="button" className="tw-btn tw-btn-primary" onClick={onClose}>
                {savedVersion != null ? "Open my CV" : "Done"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
