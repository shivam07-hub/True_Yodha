/**
 * BulletRewrite — per-bullet Mentor rewrite (pick-a-version).
 *
 * Object-action on ONE bullet: Mentor proposes 2–3 FINISHED framings of the same
 * real facts (Metric-led / Impact-led / Scope-led) and the user picks the one
 * that tells their story best. Output is finished CV lines — never the model's
 * reasoning (the server uses the paid interactive provider + a reasoning-salvage
 * guard). Nothing changes until the user clicks "Use this version".
 *
 * No-fabrication guard (ADR-0016): when the bullet has no metric, Mentor asks for
 * the real number instead of inventing one. Accept writes via cv.rewriteApply (a
 * new baseline); Discard throws it away.
 */
"use client"

import { useEffect, useState } from "react"
import { cv as cvApi, type RewriteVariant } from "@/lib/api"
import { Icon } from "./icons"

type Phase = "idle" | "loading" | "variants" | "question" | "error"

interface BulletRewriteProps {
  token: string
  bullet: string
  role?: string | null
  missingKeywords: string[]
  applying?: boolean
  onApply: (oldText: string, newText: string) => void
  /** Option C: start the rewrite immediately on mount (no idle trigger button) —
   *  the parent owns the affordance (per-line ↻ or a rail "Sharpen" action). */
  auto?: boolean
  /** Keyword(s) to target for this rewrite; falls back to missingKeywords. Also
   *  named in the intent header so the user knows what this rewrite is adding. */
  seedKeywords?: string[]
  /** Called after Use / Discard / Dismiss in auto mode so the parent collapses. */
  onClose?: () => void
}

export function BulletRewrite({ token, bullet, role, missingKeywords, applying, onApply, auto, seedKeywords, onClose }: BulletRewriteProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [variants, setVariants] = useState<RewriteVariant[]>([])
  const [sel, setSel] = useState(0)
  const [question, setQuestion] = useState<string | null>(null)
  const [citations, setCitations] = useState<string[]>([])
  const [metric, setMetric] = useState("")
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // The skill(s) this rewrite is surfacing — drives the intent header.
  const intent = (seedKeywords && seedKeywords.length ? seedKeywords : []).filter(Boolean)

  async function run(opts: { metric?: string; allowNoMetric?: boolean } = {}) {
    setPhase("loading"); setErrMsg(null); setQuestion(null)
    try {
      const res = await cvApi.rewriteBulletVariants(token, {
        bullet,
        role,
        missing_keywords: seedKeywords && seedKeywords.length ? seedKeywords : missingKeywords,
        metric: opts.metric ?? null,
        allow_no_metric: opts.allowNoMetric ?? false,
      })
      if (res.mode === "variants" && res.variants.length) {
        setVariants(res.variants); setSel(0); setCitations(res.citations ?? []); setPhase("variants")
      } else if (res.mode === "question") {
        setQuestion(res.question ?? "What was the measurable result?"); setPhase("question")
      } else {
        setErrMsg(res.rationale ?? "Rewrite is unavailable right now."); setPhase("error")
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Rewrite is unavailable. Try again."); setPhase("error")
    }
  }

  // Auto mode: the parent renders this only when the user invoked it, so kick the
  // rewrite on mount and let Discard/Use collapse it via onClose.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (auto) void run() }, [])

  function reset() {
    setPhase("idle"); setVariants([]); setSel(0); setMetric(""); setQuestion(null); setCitations([]); setErrMsg(null)
    onClose?.()
  }

  if (phase === "idle") {
    if (auto) return null
    return (
      <div className="cvb-rw-trigger-row">
        <button type="button" className="cvb-btn ghost sm cvb-rw-trigger" onClick={() => void run()}>
          <Icon name="sparkle" size={12}/> Rewrite
        </button>
      </div>
    )
  }

  return (
    <div className="cvb-rw-panel" role="group" aria-label="Rewrite suggestion">
      {/* Intent header — say exactly what this rewrite is doing to which line. */}
      <div className="cvb-rw-intent">
        <span className="cvb-rw-intent-what">Rewriting this line</span>
        {intent.length > 0 && (
          <span className="cvb-rw-intent-kw">· adding {intent.join(", ")}</span>
        )}
      </div>
      <div className="cvb-rw-original" title="Your current line">{bullet}</div>

      {phase === "loading" && (
        <div className="cvb-rw-status" role="status">✦ Mentor is writing three versions…</div>
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
              onKeyDown={(e) => { if (e.key === "Enter" && metric.trim()) void run({ metric: metric.trim() }) }}
            />
            <button type="button" className="cvb-btn sm primary" disabled={!metric.trim()} onClick={() => void run({ metric: metric.trim() })}>
              Rewrite
            </button>
          </div>
          <button type="button" className="cvb-rw-skip" onClick={() => void run({ allowNoMetric: true })}>
            No number — reframe qualitatively
          </button>
          <div className="cvb-rw-nofab">Myro never invents numbers</div>
        </div>
      )}

      {phase === "variants" && variants.length > 0 && (
        <>
          <div className="cvb-rw-pick-label">Pick the version that tells your story best</div>
          {variants.length > 1 && (
            <div className="cvb-rw-tabs" role="tablist">
              {variants.map((v, i) => (
                <button
                  key={v.angle}
                  type="button"
                  role="tab"
                  aria-selected={i === sel}
                  className={`cvb-rw-tab${i === sel ? " active" : ""}`}
                  onClick={() => setSel(i)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          <div className="cvb-rw-diff-new">{variants[sel]?.text}</div>
          {citations.length > 0 && (
            <div className="cvb-rw-citation" title="These versions were grounded in the Myro CV Playbook">
              <Icon name="sparkle" size={11}/> Grounded in {citations.join(", ")}
            </div>
          )}
          <div className="cvb-rw-actions">
            <button type="button" className="cvb-btn sm" onClick={reset} disabled={applying}>Discard</button>
            <button
              type="button"
              className="cvb-btn sm primary"
              disabled={applying || !variants[sel]?.text.trim()}
              onClick={() => { onApply(bullet, (variants[sel]?.text ?? "").trim()); reset() }}
            >
              <Icon name="check" size={12}/> {applying ? "Applying…" : "Use this version"}
            </button>
          </div>
        </>
      )}

      {phase === "error" && (
        <div className="cvb-rw-error" role="alert">
          <span>{errMsg}</span>
          <button type="button" className="cvb-rw-skip" onClick={() => void run()}>Try again</button>
          <button type="button" className="cvb-rw-skip" onClick={reset}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
