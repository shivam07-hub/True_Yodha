/**
 * BulletRewrite — per-bullet Mentor rewrite (DESIGN_cv_playground_redesign §6).
 *
 * Object-action on a bullet: propose a stronger, JD-aligned rewrite shown as a
 * before→after diff. No-fabrication guard (ADR-0016): when the bullet has no
 * metric, Mentor asks for the real number instead of inventing one. Accept
 * writes via cv.rewriteApply (a new baseline); Discard throws the proposal away.
 */
"use client"

import { useState } from "react"
import { cv as cvApi, type RewriteBulletResponse } from "@/lib/api"
import { Icon } from "./icons"

type Phase = "idle" | "loading" | "question" | "diff" | "error"

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
  const [proposed, setProposed] = useState("")
  const [metric, setMetric] = useState("")
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function run(opts: { metric?: string; allowNoMetric?: boolean } = {}) {
    setPhase("loading")
    setErrMsg(null)
    try {
      const res: RewriteBulletResponse = await cvApi.rewriteBullet(token, {
        bullet,
        role,
        missing_keywords: missingKeywords,
        metric: opts.metric,
        allow_no_metric: opts.allowNoMetric,
      })
      if (res.mode === "question") {
        setQuestion(res.question ?? "What was the measurable result?")
        setPhase("question")
      } else if (res.mode === "rewrite") {
        setProposed(res.rewritten_text ?? "")
        setRationale(res.rationale ?? null)
        setPhase("diff")
      } else {
        setErrMsg(res.rationale ?? "Rewrite is unavailable.")
        setPhase("error")
      }
    } catch {
      setErrMsg("Rewrite is unavailable. Try again.")
      setPhase("error")
    }
  }

  function reset() {
    setPhase("idle"); setProposed(""); setMetric(""); setQuestion(null); setRationale(null); setErrMsg(null)
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

  return (
    <div className="cvb-rw-panel" role="group" aria-label="Rewrite suggestion">
      {phase === "loading" && <div className="cvb-rw-status" role="status">✦ Mentor is rewriting…</div>}

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
          <div className="cvb-rw-nofab">Myro never invents numbers · ADR-0016</div>
        </div>
      )}

      {phase === "diff" && (
        <div className="cvb-rw-diff">
          <div className="cvb-rw-diff-tag">before</div>
          <div className="cvb-rw-diff-old">{bullet}</div>
          <div className="cvb-rw-diff-tag">after</div>
          <div className="cvb-rw-diff-new">{proposed}</div>
          {rationale && <div className="cvb-rw-rationale">{rationale}</div>}
          <div className="cvb-rw-actions">
            <button type="button" className="cvb-btn sm" onClick={reset} disabled={applying}>Discard</button>
            <button
              type="button"
              className="cvb-btn sm primary"
              disabled={applying || !proposed.trim()}
              onClick={() => { onApply(bullet, proposed.trim()); reset() }}
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
