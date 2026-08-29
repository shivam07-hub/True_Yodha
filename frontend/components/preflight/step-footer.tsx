"use client"

/**
 * The footer, pinned. One primary action, one quiet way past it.
 *
 * The run bar used to sit at the BOTTOM OF THE SCROLL — under six slot groups,
 * the facts, the say band and the heard fold — so on a full order the only
 * control that does anything was two screens below the fold. Pinning it is
 * most of the reason the redesign is worth doing.
 *
 * Stacked, full-width, primary over secondary, taken from the reference
 * designs. The one thing NOT taken from them is the radius: their Continue is
 * a full pill, and a fully-rounded primary is the pillow-radius tell
 * ANTI_SLOP rules against, so it sits on `--tm-button-radius` like every other
 * button in the product.
 */

export function StepFooter({
  note,
  primaryLabel,
  primaryMeta,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  onSecondary,
  undo,
}: {
  /** The one sentence that is not already on screen — the contract, a block,
   *  or a cost the user is short for. */
  note?: React.ReactNode
  primaryLabel: string
  /** The cost, on the run step. Kept out of the label so the label stays one
   *  verb and never becomes two fused labels. */
  primaryMeta?: React.ReactNode
  primaryDisabled?: boolean
  onPrimary: () => void
  /** Absent unless there is genuinely something to skip. "Skip for now" under
   *  a step the user has already filled offers to skip nothing. */
  secondaryLabel?: string | null
  onSecondary?: () => void
  undo?: React.ReactNode
}) {
  return (
    <div className="pf-footer">
      {undo}
      {note ? <div className="pf-footer-note">{note}</div> : null}
      <button
        type="button"
        className="pf-primary tm-control-focus"
        onClick={onPrimary}
        disabled={primaryDisabled}
        aria-disabled={primaryDisabled}
      >
        <span>{primaryLabel}</span>
        {primaryMeta ? (
          <>
            <span className="pf-primary-sep" aria-hidden>·</span>
            <span className="pf-primary-meta">{primaryMeta}</span>
          </>
        ) : null}
      </button>
      {secondaryLabel && onSecondary ? (
        <button type="button" className="pf-secondary tm-control-focus" onClick={onSecondary}>
          {secondaryLabel}
        </button>
      ) : null}
    </div>
  )
}
