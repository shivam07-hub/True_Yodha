"use client"

/**
 * A guess still needing a verdict. Two decisive fills — vermilion `yes`,
 * crimson `no` — because a dashed outline next to a filled pill reads as
 * "still deciding" for the side that already answered. Both sides fill
 * in their own semantic colour; the button says one word, never two.
 */

import { Icon } from "@/components/cv/builder/icons"
import { SOURCE_LABEL, type LineSource } from "@/lib/preflight/types"

type Verdict = "kept" | "dropped" | null

export function HeardRow({
  text,
  source,
  sourceNote,
  answered,
  disableYes,
  busy,
  onAnswer,
}: {
  text: string
  source?: LineSource
  sourceNote?: string | null
  answered: Verdict
  /** Locked out of `yes` when the line is unusable — reword is the only path. */
  disableYes?: boolean
  busy?: boolean
  onAnswer: (verdict: Verdict) => void
}) {
  const why = sourceNote || (source ? SOURCE_LABEL[source] : "")
  return (
    <div className="pf-heard" role="group" aria-label={source ? `${text} — ${SOURCE_LABEL[source]}` : text}>
      <div className="pf-heard-copy">
        <div className="pf-heard-line">{text}</div>
        {why ? <div className="pf-heard-why">{why}</div> : null}
      </div>
      <div className="pf-heard-actions">
        {disableYes ? null : (
          <button
            type="button"
            className="pf-heard-btn tm-control-focus"
            data-kind="yes"
            data-picked={answered === "kept" ? "yes" : undefined}
            aria-pressed={answered === "kept"}
            onClick={() => onAnswer(answered === "kept" ? null : "kept")}
            disabled={busy}
          >
            <Icon name="check" size={13} /> yes
          </button>
        )}
        <button
          type="button"
          className="pf-heard-btn tm-control-focus"
          data-kind="no"
          data-picked={answered === "dropped" ? "no" : undefined}
          aria-pressed={answered === "dropped"}
          onClick={() => onAnswer(answered === "dropped" ? null : "dropped")}
          disabled={busy}
        >
          no
        </button>
      </div>
    </div>
  )
}
