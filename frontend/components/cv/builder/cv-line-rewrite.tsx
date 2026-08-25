/**
 * CvLineRewrite — rank 1. The stronger version of ONE line, under that line.
 *
 * Handoff §3: "The rewrite happens inline, under the line. The rail never
 * expands a rewrite — that is the whole point of the triage split." The rail
 * decides what to fix; the paper is where it gets fixed, with the original still
 * visible directly above. That is also why this card carries no "before" quote:
 * the CV pane IS the quote.
 *
 * Mounting this component IS the request — the fetch fires in useLineRewrite's
 * mount effect. CvLineFix therefore keeps it unmounted until the user presses
 * "Rewrite with Mentor", which is what makes the model call impossible to
 * trigger by opening, jumping to, or re-rendering a line.
 *
 * Every variant is checked against the promise the row made (fix-verify) before
 * it is offered. A "Cut leverage" that came back still saying leverage is a
 * miss, not a weaker option, and the card says so.
 *
 * On a phone the same card renders as a bottom sheet (CSS only — an inline card
 * under line 9 of 15 puts its primary button below the fold).
 */
"use client"

import { useMemo, useState } from "react"
import { WeaveLoom } from "./mentor-thinking"
import { passingVariants } from "./fix-verify"
import type { V2Fix } from "./fix-model"
import { useLineRewrite, type RewriteFetcher } from "./use-line-rewrite"

const REWRITE_LOOM = [
  "Reading your line",
  "Finding what's strong",
  "Sharpening the wording",
  "Checking every fact survives",
]

interface CvLineRewriteProps {
  fetcher: RewriteFetcher
  /** The promise this rewrite has to keep. Null on paths with no named defect. */
  fix?: V2Fix | null
  applying?: boolean
  /** A Quantify fix promises a real number, so a metric-less reframe is not a
   *  valid outcome — the question is the only path out. */
  quantifyOnly?: boolean
  onApply: (text: string) => void
  onDiscard: () => void
}

export function CvLineRewrite({
  fetcher, fix, applying, quantifyOnly, onApply, onDiscard,
}: CvLineRewriteProps) {
  const rw = useLineRewrite(fetcher)
  const [metric, setMetric] = useState("")
  const [anglesOpen, setAnglesOpen] = useState(false)

  // Only variants that actually removed the named defect are offered.
  const kept = useMemo(
    () => passingVariants(fix ?? null, rw.variants),
    [fix, rw.variants],
  )
  const missed = rw.phase === "variants" && rw.variants.length > 0 && kept.length === 0
  const chosen = kept[Math.min(rw.selected, Math.max(0, kept.length - 1))]

  return (
    <div className="cvw-rw" role="group" aria-label="Stronger version">
      <div className="cvw-rw-head">
        <span className="cvw-rw-label">stronger version</span>
        {rw.phase === "variants" && kept.length > 0 && (
          <span className="cvw-rw-count">
            {Math.min(rw.selected, kept.length - 1) + 1} of {kept.length} angle{kept.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {rw.phase === "loading" && <WeaveLoom lines={REWRITE_LOOM} settled={false} />}

      {rw.phase === "suggest_metric" && rw.candidate && (
        <>
          <p className="cvw-rw-ask">
            {rw.question ?? `Your story “${rw.candidate.source}” mentions ${rw.candidate.value}.`}
          </p>
          <div className="cvw-rw-foot">
            <button type="button" className="cvw-rw-primary" onClick={() => rw.withMetric(rw.candidate!.value)}>
              Use {rw.candidate.value}
            </button>
            <button type="button" className="cvw-rw-ghost" onClick={rw.askInstead}>My own number</button>
            <button type="button" className="cvw-rw-discard" onClick={onDiscard}>Discard</button>
          </div>
        </>
      )}

      {rw.phase === "question" && (
        <>
          <p className="cvw-rw-ask">{rw.question}</p>
          <textarea
            className="cvw-rw-input"
            rows={2}
            autoFocus
            value={metric}
            placeholder="e.g. activation 22% → 31% in Q2"
            aria-label="What the number was"
            onChange={e => setMetric(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey && metric.trim()) {
                e.preventDefault(); rw.withMetric(metric.trim())
              }
            }}
          />
          <p className="cvw-rw-why">Myro never invents numbers.</p>
          <div className="cvw-rw-foot">
            <button
              type="button"
              className="cvw-rw-primary"
              disabled={!metric.trim()}
              onClick={() => rw.withMetric(metric.trim())}
            >Use this number</button>
            {!quantifyOnly && (
              <button type="button" className="cvw-rw-ghost" onClick={rw.withoutMetric}>Reframe instead</button>
            )}
            <button type="button" className="cvw-rw-discard" onClick={onDiscard}>Discard</button>
          </div>
        </>
      )}

      {/* The rewrite came back without doing what the row promised. Offering it
          anyway is how a "Cut leverage" shipped a line that still said leverage. */}
      {missed && (
        <>
          <p className="cvw-rw-error" role="alert">
            Mentor didn&rsquo;t make that change. Your line is untouched.
          </p>
          <div className="cvw-rw-foot">
            <button type="button" className="cvw-rw-primary" onClick={rw.retry}>Try again</button>
            <button type="button" className="cvw-rw-discard" onClick={onDiscard}>Close</button>
          </div>
        </>
      )}

      {rw.phase === "variants" && chosen && !missed && (
        <>
          <p className="cvw-rw-text">{chosen.text}</p>
          {chosen.why && <p className="cvw-rw-why">{chosen.why}</p>}
          {anglesOpen && kept.length > 1 && (
            <div className="cvw-rw-angles" role="tablist" aria-label="Other angles">
              {kept.map((v, i) => (
                <button
                  key={v.angle}
                  type="button"
                  role="tab"
                  aria-selected={i === rw.selected}
                  className="cvw-rw-angle"
                  onClick={() => rw.select(i)}
                >{v.label}</button>
              ))}
            </div>
          )}
          <div className="cvw-rw-foot">
            <button
              type="button"
              className="cvw-rw-primary"
              disabled={applying || !chosen.text.trim()}
              onClick={() => onApply(chosen.text.trim())}
            >{applying ? "Applying…" : "Use this line"}</button>
            {kept.length > 1 && (
              <button
                type="button"
                className="cvw-rw-ghost"
                aria-expanded={anglesOpen}
                onClick={() => setAnglesOpen(o => !o)}
              >Other angles</button>
            )}
            <button type="button" className="cvw-rw-discard" onClick={onDiscard}>Discard</button>
          </div>
        </>
      )}

      {rw.phase === "error" && (
        <>
          <p className="cvw-rw-error" role="alert">{rw.error}</p>
          <div className="cvw-rw-foot">
            <button type="button" className="cvw-rw-primary" onClick={rw.retry}>Try again</button>
            <button type="button" className="cvw-rw-discard" onClick={onDiscard}>Close</button>
          </div>
        </>
      )}
    </div>
  )
}
