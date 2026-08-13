/**
 * BulletRewrite — per-bullet Mentor rewrite.
 *
 * Object-action on ONE bullet: Mentor proposes the strongest rewrite of the same
 * real facts (recommended first), with alternate framings on tap. The card reads
 * as a transformation — your current line (reference) → the stronger line + a plain
 * reason it wins for YOU. Output is finished CV lines, never the model's reasoning
 * (server: strong-only writer floor + reasoning-salvage guard). Nothing changes
 * until "Use this line".
 *
 * No-fabrication (ADR-0016): a metric-less bullet is never given an invented number.
 * First Mentor looks in the user's OWN stories for a real one and offers it with
 * provenance (suggest_metric); if there's none it asks (question). A Quantify fix is
 * satisfied ONLY by a real number — for it, `quantifyOnly` hides the reframe escape.
 */
"use client"

import { useEffect, useState } from "react"
import { cv as cvApi, type RewriteVariant } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "./icons"
import { WeaveLoom } from "./mentor-thinking"

const REWRITE_LOOM = [
  "Reading your line",
  "Finding what's strong",
  "Sharpening the wording",
  "Checking every fact survives",
]

type Phase = "idle" | "loading" | "variants" | "question" | "suggest_metric" | "error"

interface BulletRewriteProps {
  token: string
  bullet: string
  role?: string | null
  missingKeywords: string[]
  applying?: boolean
  onApply: (oldText: string, newText: string) => void
  auto?: boolean
  seedKeywords?: string[]
  onClose?: () => void
  /** Quantify context (Q2): the fix promises a real number, so a metric-less
   *  reframe is not a valid outcome — the question is the only path (no escape). */
  quantifyOnly?: boolean
  /** "weave" (Surface-skill fixes): one minimal keyword-insertion edit instead of
   *  the reframe — the fix kind drives the rewrite instruction. */
  intent?: "weave"
}

export function BulletRewrite({ token, bullet, role, missingKeywords, applying, onApply, auto, seedKeywords, onClose, quantifyOnly, intent }: BulletRewriteProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [variants, setVariants] = useState<RewriteVariant[]>([])
  const [sel, setSel] = useState(0)
  const [showAlternates, setShowAlternates] = useState(false)
  const [question, setQuestion] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<{ value: string; source: string } | null>(null)
  const [metric, setMetric] = useState("")
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function run(opts: { metric?: string; allowNoMetric?: boolean } = {}) {
    setPhase("loading"); setErrMsg(null); setQuestion(null); setCandidate(null)
    try {
      const res = await cvApi.rewriteBulletVariants(token, {
        bullet,
        role,
        missing_keywords: seedKeywords && seedKeywords.length ? seedKeywords : missingKeywords,
        metric: opts.metric ?? null,
        allow_no_metric: opts.allowNoMetric ?? false,
        intent,
      })
      if (res.mode === "variants" && res.variants.length) {
        setVariants(res.variants); setSel(0); setShowAlternates(false); setPhase("variants")
      } else if (res.mode === "suggest_metric" && res.candidate_value) {
        setCandidate({ value: res.candidate_value, source: res.candidate_source ?? "your story" })
        setQuestion(res.question ?? null); setMetric(""); setPhase("suggest_metric")
      } else if (res.mode === "question") {
        setQuestion(res.question ?? "What was the measurable result?"); setMetric(""); setPhase("question")
      } else {
        setErrMsg(res.rationale ?? "Rewrite is unavailable right now."); setPhase("error")
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Rewrite is unavailable. Try again."); setPhase("error")
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (auto) void run() }, [])

  function reset() {
    setPhase("idle"); setVariants([]); setSel(0); setShowAlternates(false)
    setMetric(""); setQuestion(null); setCandidate(null); setErrMsg(null)
    onClose?.()
  }

  if (phase === "idle") {
    if (auto) return null
    return (
      <div className="cvb-rw-trigger-row">
        <Button variant="ghost" size="sm" className="cvb-rw-trigger" onClick={() => void run()}>
          <Icon name="sparkle" size={12}/> Rewrite
        </Button>
      </div>
    )
  }

  const recommended = variants[sel]
  const hasAlternates = variants.length > 1

  return (
    <div className="cvb-rw-panel" role="group" aria-label="Rewrite suggestion">
      {/* The current line — the "before", quiet reference; the user judges the change. */}
      <div className="cvb-rw-original" title="Your current line">{bullet}</div>

      {phase === "loading" && (
        <WeaveLoom lines={REWRITE_LOOM} settled={false} />
      )}

      {/* A real number from the user's own history — offered, never assumed (Q5). */}
      {phase === "suggest_metric" && candidate && (
        <div className="cvb-rw-ask">
          <div className="cvb-rw-ask-q">
            <Icon name="sparkle" size={12}/> {question ?? `Your story “${candidate.source}” mentions ${candidate.value}.`}
          </div>
          <div className="cvb-rw-ask-actions">
            <Button size="sm" onClick={() => void run({ metric: candidate.value })}>
              Use {candidate.value}
            </Button>
            <button type="button" className="cvb-rw-skip" onClick={() => { setQuestion("What was the real number?"); setPhase("question") }}>
              No — my own number
            </button>
          </div>
        </div>
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
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && metric.trim()) void run({ metric: metric.trim() }) }}
            />
            <Button size="sm" disabled={!metric.trim()} onClick={() => void run({ metric: metric.trim() })}>
              Rewrite
            </Button>
          </div>
          {!quantifyOnly && (
            <button type="button" className="cvb-rw-skip" onClick={() => void run({ allowNoMetric: true })}>
              No number — reframe the wording
            </button>
          )}
          <div className="cvb-rw-nofab">Myro never invents numbers</div>
        </div>
      )}

      {phase === "variants" && recommended && (
        <>
          {/* The recommendation — the "after", accent, with the plain reason it wins. */}
          <div className="cvb-rw-diff-new">{recommended.text}</div>
          {recommended.why && <div className="cvb-rw-why">{recommended.why}</div>}

          {hasAlternates && (
            <div className="cvb-rw-alt">
              <button
                type="button"
                className="cvb-rw-alt-toggle"
                aria-expanded={showAlternates}
                onClick={() => setShowAlternates(v => !v)}
              >
                <Icon name="chevron-down" size={12} className={showAlternates ? "cvb-rw-chev-open" : ""}/>
                {showAlternates ? "Hide angles" : `Other angles (${variants.length - 1})`}
              </button>
              {showAlternates && (
                <div className="cvb-rw-alt-chips" role="tablist">
                  {variants.map((v, i) => (
                    <button
                      key={v.angle}
                      type="button"
                      role="tab"
                      aria-selected={i === sel}
                      className={`cvb-rw-alt-chip${i === sel ? " active" : ""}`}
                      onClick={() => setSel(i)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="cvb-rw-actions">
            <Button variant="dismiss" size="sm" onClick={reset} disabled={applying}>Discard</Button>
            <Button
              size="sm"
              disabled={applying || !recommended.text.trim()}
              onClick={() => { onApply(bullet, recommended.text.trim()); reset() }}
            >
              <Icon name="check" size={12}/> {applying ? "Applying…" : "Use this line"}
            </Button>
          </div>
        </>
      )}

      {phase === "error" && (
        <div className="cvb-rw-error" role="alert">
          <span>{errMsg}</span>
          <button type="button" className="cvb-rw-skip" onClick={() => void run()}>Try again</button>
          <button type="button" className="cvb-rw-skip tm-dismiss-action" onClick={reset}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
