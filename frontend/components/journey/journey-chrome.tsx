"use client"

/**
 * The journey chrome, with no idea what a step contains.
 *
 * Myro Search and onboarding's Direction step had the same defect and were
 * about to get the same fix twice: six decisions in one long scroll, a primary
 * action at the bottom of it, and nothing saying how far along you are. Two
 * copies of that fix would drift the way `SLOT_ARITY` drifted — agreeing on
 * the shape and disagreeing on the details.
 *
 * So the three pieces that are pure presentation live here: the ribbon, the
 * head, and the actions. They take a `{ key, title }` and callbacks; they know
 * nothing about an Order, a slot, a role family or a token. Everything that
 * knows what a step MEANS stays with the surface that owns the data.
 *
 * Styling: `journey-chrome.css` names app tokens, so this renders correctly on
 * a page ground. Myro Search remaps those tokens to its own `--pf-*` palette
 * inside `.pf-modal`, because glass needs contrast the page set does not give.
 */

import { Icon } from "@/components/cv/builder/icons"

import "./journey-chrome.css"

export interface RibbonStep {
  key: string
  /** Reaches a screen reader, never the screen: six words across 560px is
   *  legible and across 375px is not, and the step's own title is three lines
   *  under the ribbon saying where you are in full. */
  title: string
  /** Draws the dot — this step still wants something from the user. */
  asks?: boolean
  /** Extends the accessible name: "Where — 1 to answer". */
  askLabel?: string
}

/**
 * Where you are, and the way back to anywhere you have been.
 *
 * A segment is a BUTTON. `JourneyProgress` learned this the hard way: a
 * ticked, numbered sequence that cannot be clicked still looks like one that
 * can, and the only route back through onboarding was a control that DELETED
 * the answer behind it.
 */
export function StepRibbon({
  steps,
  current,
  onJump,
  label = "Steps",
}: {
  steps: readonly RibbonStep[]
  current: string
  onJump: (key: string) => void
  label?: string
}) {
  const at = steps.findIndex((s) => s.key === current)
  return (
    <nav className="jr-ribbon" aria-label={label}>
      {steps.map((step, i) => (
        <button
          key={step.key}
          type="button"
          className="jr-seg tm-control-focus"
          data-state={i < at ? "done" : i === at ? "current" : "ahead"}
          data-asks={step.asks ? "true" : undefined}
          aria-current={i === at ? "step" : undefined}
          aria-label={step.askLabel ? `${step.title} — ${step.askLabel}` : step.title}
          onClick={() => onJump(step.key)}
        />
      ))}
    </nav>
  )
}

/**
 * The head. Biggest thing on the screen, and in this order.
 *
 * `recall` sits ABOVE the title because it is the frame the title is read
 * inside — "here is what I already had" before "here is what this is". It is
 * also the whole reason a returning user should feel known rather than
 * re-interviewed, so it is a first-class slot rather than a caption.
 */
export function StepHead({
  recall,
  title,
  lede,
  tight,
}: {
  recall?: React.ReactNode
  /** A noun. The reference designs ask questions; Myro's copy law does not,
   *  and the lede does that work instead. */
  title: string
  lede?: React.ReactNode
  /** A title that is user content rather than a label — a joined list of role
   *  titles — sets a size down and wraps instead of filling the screen. */
  tight?: boolean
}) {
  return (
    <div className="jr-head">
      {recall ? <p className="jr-recall">{recall}</p> : null}
      <h2 className="jr-title" data-tight={tight ? "true" : undefined}>{title}</h2>
      {lede ? <p className="jr-lede">{lede}</p> : null}
    </div>
  )
}

/**
 * One primary action, one quiet way past it, both full width and stacked.
 *
 * Taken from the reference designs. The one thing not taken from them is the
 * radius: their Continue is a full pill, and a fully-rounded primary is the
 * pillow-radius tell ANTI_SLOP rules against, so it sits on
 * `--tm-button-radius` like every other button in the product.
 */
export function StepActions({
  note,
  before,
  primaryLabel,
  primaryMeta,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  /** The one sentence not already on screen — a contract, a block, a cost the
   *  user is short for. Everything else it could say, the step above shows. */
  note?: React.ReactNode
  /** Anything that belongs above the note and below the body — the undo row. */
  before?: React.ReactNode
  primaryLabel: string
  /** Kept out of the label so the label stays one verb and never becomes two
   *  labels fused ("Run · 150 coins" is a verb and a price, not two names). */
  primaryMeta?: React.ReactNode
  primaryDisabled?: boolean
  onPrimary: () => void
  /** Absent unless there is genuinely something to skip. "Skip for now" under
   *  a step the user has already filled offers to skip nothing. */
  secondaryLabel?: string | null
  onSecondary?: () => void
}) {
  return (
    <div className="jr-actions">
      {before}
      {note ? <div className="jr-note">{note}</div> : null}
      <button
        type="button"
        className="jr-primary tm-control-focus"
        onClick={onPrimary}
        disabled={primaryDisabled}
        aria-disabled={primaryDisabled}
      >
        <span>{primaryLabel}</span>
        {primaryMeta ? (
          <>
            <span className="jr-primary-sep" aria-hidden>·</span>
            <span className="jr-primary-meta">{primaryMeta}</span>
          </>
        ) : null}
      </button>
      {secondaryLabel && onSecondary ? (
        <button type="button" className="jr-secondary tm-control-focus" onClick={onSecondary}>
          {secondaryLabel}
        </button>
      ) : null}
    </div>
  )
}

/** The way back a step. Top-left, so the footer stays the forward action —
 *  a Back beside Continue competes with it for the same tap. */
export function StepBack({ onBack, label = "Back a step" }: { onBack: () => void; label?: string }) {
  return (
    <button type="button" className="jr-back tm-control-focus" onClick={onBack} aria-label={label}>
      <Icon name="chevron-left" size={18} />
    </button>
  )
}
