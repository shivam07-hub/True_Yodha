/**
 * Clear states — what the rail becomes when there is nothing left to fix
 * (handoff §5 / screen 2b).
 *
 * The old surface answered "no fixes open" with a dashed card that still sat
 * under two tabs and a lede paragraph, so a finished CV looked like an
 * unfinished one with an empty list. Three rules replace that:
 *
 *   · fixes clear      → the toggle COLLAPSES into a 34px strip, and Skills
 *                        takes the whole rail. A tab you cannot use is chrome.
 *   · fixes clear,     → no Skills exists logged out, so the rail becomes the
 *     logged out         terminal card: the verdict, the delta, and Download.
 *   · both clear       → download/apply is the only action left on screen.
 */
"use client"

interface CvClearStripProps {
  /** Fixes closed in this session — the strip is a receipt, not a banner. */
  fixedCount: number
  /** Present ⇒ the strip can reopen the closed queue. */
  onReview?: () => void
  reviewing?: boolean
}

export function CvClearStrip({ fixedCount, onReview, reviewing }: CvClearStripProps) {
  return (
    <div className="cvw-clear">
      <span className="cvw-clear-title">✓ CV clean</span>
      <span className="cvw-clear-count">
        {fixedCount > 0 ? `${fixedCount} fixed today` : "nothing open"}
      </span>
      {onReview && (
        <button
          type="button"
          className="cvw-clear-review"
          aria-expanded={!!reviewing}
          onClick={onReview}
        >review {reviewing ? "▴" : "▾"}</button>
      )}
    </div>
  )
}

interface CvTerminalCardProps {
  title: string
  sub: string
  score: number
  /** The score before this session. Omitted when there is no honest baseline. */
  was?: number | null
  ctaLabel: string
  ctaBusy?: boolean
  onCta: () => void
}

export function CvTerminalCard({
  title, sub, score, was, ctaLabel, ctaBusy, onCta,
}: CvTerminalCardProps) {
  return (
    <div className="cvw-terminal">
      <div className="cvw-terminal-mark" aria-hidden>✓</div>
      <div className="cvw-terminal-title">{title}</div>
      <p className="cvw-terminal-sub">{sub}</p>
      <div className="cvw-terminal-score">
        <span className="cvw-terminal-num">{score}</span>
        <span className="cvw-terminal-cap">
          /100{was != null && was !== score ? ` · was ${was}` : ""}
        </span>
      </div>
      <button
        type="button"
        className="cvw-terminal-cta"
        disabled={ctaBusy}
        aria-busy={ctaBusy}
        onClick={onCta}
      >{ctaBusy ? "Preparing…" : ctaLabel}</button>
    </div>
  )
}

export function CvMatchInvite({ onMatch }: { onMatch: () => void }) {
  return (
    <button type="button" className="cvw-invite" onClick={onMatch}>
      <span className="cvw-invite-copy">
        Skills only unlock when you point this CV at a job.
      </span>
      <span className="cvw-invite-go">match →</span>
    </button>
  )
}
