/**
 * BulletRewrite — per-bullet Mentor rewrite (DESIGN_cv_playground_redesign §6).
 *
 * Object-action on a bullet: propose a stronger, JD-aligned rewrite shown as a
 * before→after diff. The rewrite STREAMS token-by-token (ADR-0009) — the user
 * watches Mentor type the new bullet instead of staring at a blank spinner.
 * No-fabrication guard (ADR-0016): when the bullet has no metric, Mentor asks
 * for the real number instead of inventing one (a terminal frame, no tokens).
 * Accept writes via cv.rewriteApply (a new baseline); Discard throws it away.
 */
"use client"

import { useState } from "react"
import { cv as cvApi } from "@/lib/api"
import { useStreamingText, type StreamEvent } from "@/lib/hooks/use-streaming-text"
import { Icon } from "./icons"

type Phase = "idle" | "run" | "question" | "error"

interface BulletRewriteProps {
  token: string
  bullet: string
  role?: string | null
  missingKeywords: string[]
  applying?: boolean
  onApply: (oldText: string, newText: string) => void
}

export function BulletRewrite({ token, bullet, role, missingKeywords, applying, onApply }: BulletRewriteProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [question, setQuestion] = useState<string | null>(null)
  const [rationale, setRationale] = useState<string | null>(null)
  const [citations, setCitations] = useState<string[]>([])
  // Canonical rewrite text from the terminal `done` frame. While it's null the
  // live (still-typing) stream text is shown; Accept is gated on this being set.
  const [proposed, setProposed] = useState<string | null>(null)
  const [metric, setMetric] = useState("")
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const stream = useStreamingText()

  function onDone(ev: StreamEvent) {
    if (ev.type === "error") {
      setErrMsg((ev.message as string) ?? "Rewrite is unavailable. Try again.")
      setPhase("error")
    } else if (ev.mode === "question") {
      setQuestion((ev.question as string) ?? "What was the measurable result?")
      setPhase("question")
    } else {
      setProposed((ev.rewritten_text as string) ?? "")
      setRationale((ev.rationale as string) ?? null)
      setCitations((ev.citations as string[]) ?? [])
    }
  }

  function run(opts: { metric?: string; allowNoMetric?: boolean } = {}) {
    setErrMsg(null); setQuestion(null); setRationale(null); setCitations([]); setProposed(null)
    setPhase("run")
    stream.start(cvApi.rewriteBulletStreamPath, token, onDone, {
      bullet,
      role,
      missing_keywords: missingKeywords,
      metric: opts.metric,
      allow_no_metric: opts.allowNoMetric,
    })
  }

  function reset() {
    stream.reset()
    setPhase("idle"); setProposed(null); setMetric(""); setQuestion(null); setRationale(null); setCitations([]); setErrMsg(null)
  }

  if (phase === "idle") {
    return (
      <div className="cvb-rw-trigger-row">
        <button type="button" className="cvb-btn ghost sm cvb-rw-trigger" onClick={() => run()}>
          <Icon name="sparkle" size={12}/> Rewrite
        </button>
      </div>
    )
  }

  // The after-text being typed (live) or the settled canonical rewrite.
  const afterText = proposed ?? stream.text
  const showDiff = phase === "run" && (afterText.length > 0 || stream.status !== "streaming")
  const ready = proposed !== null

  return (
    <div className="cvb-rw-panel" role="group" aria-label="Rewrite suggestion">
      {phase === "run" && !showDiff && (
        <div className="cvb-rw-status" role="status">✦ Mentor is rewriting…</div>
      )}

      {phase === "question" && (
        <div className="cvb-rw-ask">
          <div className="cvb-rw-ask-q">{question}</div>
          <div className="cvb-rw-ask-row">
            <input
              className="cvb-rw-input"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              placeholder="e.g. activation 22% → 31% in Q2"
              aria-label="Real measurable result"
              onKeyDown={(e) => { if (e.key === "Enter" && metric.trim()) run({ metric: metric.trim() }) }}
            />
            <button type="button" className="cvb-btn sm primary" disabled={!metric.trim()} onClick={() => run({ metric: metric.trim() })}>
              Rewrite
            </button>
          </div>
          <button type="button" className="cvb-rw-skip" onClick={() => run({ allowNoMetric: true })}>
            No number — reframe qualitatively
          </button>
          <div className="cvb-rw-nofab">Myro never invents numbers</div>
        </div>
      )}

      {phase === "run" && showDiff && (
        <div className="cvb-rw-diff">
          <div className="cvb-rw-diff-tag">before</div>
          <div className="cvb-rw-diff-old">{bullet}</div>
          <div className="cvb-rw-diff-tag">after</div>
          <div className="cvb-rw-diff-new">
            {afterText}
            {stream.typing && <span className="cvb-rw-caret" aria-hidden>▍</span>}
          </div>
          {rationale && <div className="cvb-rw-rationale">{rationale}</div>}
          {citations.length > 0 && (
            <div className="cvb-rw-citation" title="This rewrite was grounded in the Myro CV Playbook">
              <Icon name="sparkle" size={11}/> Grounded in {citations.join(", ")}
            </div>
          )}
          <div className="cvb-rw-actions">
            <button type="button" className="cvb-btn sm" onClick={reset} disabled={applying}>Discard</button>
            <button
              type="button"
              className="cvb-btn sm primary"
              disabled={applying || !ready || !afterText.trim()}
              onClick={() => { onApply(bullet, (proposed ?? "").trim()); reset() }}
            >
              <Icon name="check" size={12}/> {applying ? "Applying…" : "Accept"}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="cvb-rw-error" role="alert">
          <span>{errMsg}</span>
          <button type="button" className="cvb-rw-skip" onClick={reset}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
