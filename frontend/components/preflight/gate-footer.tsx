"use client"

/**
 * The foot states the cost of the next step BEFORE it is taken — how many
 * guesses get dropped, and what the run charges.
 *
 * The utterance is edited on its own bubble. This bar never captions that.
 */

type Screen = "start" | "proposals" | "confirm" | "ready" | "running" | "done"

export function GateFooter({
  screen, thinking, rounds, round, unanswered, proposalDrops, acceptedNow,
  free, runCost, short, busy, ranBefore, blocked, onBack, onNext,
}: {
  screen: Screen; thinking: boolean; rounds: number; round: number; unanswered: number
  proposalDrops: number; acceptedNow: number
  free: boolean; runCost: number; short: boolean; busy: boolean
  ranBefore: boolean
  blocked: boolean
  onBack: () => void; onNext: () => void
}) {
  if (screen === "start" || screen === "running" || screen === "done") return null
  // While Myro is still reading, there is nothing to continue TO. The button was
  // offering "Continue · keep 0" over an empty card — a true count of a list
  // that has not arrived, which reads as "Myro found nothing" and invites the
  // one click that skips the proposals. Edit lives on the bubble, so the bar
  // stays gone until a next step exists.
  if (screen === "proposals" && thinking) return null

  const backLabel =
    screen === "confirm" ? (round > 0 ? "← previous round" : "← back to what Myro heard")
      : screen === "ready" ? "← Change something"
        : null

  const nextLabel =
    screen === "proposals"
      ? proposalDrops > 0 ? `Continue · drop ${proposalDrops}` : `Continue · keep ${acceptedNow}`
      : screen === "confirm"
        ? round < rounds - 1 ? `Next · ${round + 2} of ${rounds}` : "Review the order"
        : ranBefore
          ? (free ? "▸ Run again · Free" : `▸ Run again · ${runCost}`)
          : (free ? "▸ Run · Free" : `▸ Run · ${runCost}`)

  return (
    <div className="pf-foot" data-solo={backLabel ? undefined : "true"}>
      {backLabel ? (
        <button type="button" className="pf-btn pf-btn-ghost tm-control-focus" onClick={onBack}>
          {backLabel}
        </button>
      ) : null}
      <div className="pf-foot-right">
        {((screen === "confirm" || screen === "ready") && unanswered > 0) ? (
          <span className="pf-drop-note">{unanswered} unanswered → dropped</span>
        ) : null}
        <button
          type="button"
          className="pf-btn pf-btn-primary tm-control-focus"
          onClick={onNext}
          disabled={busy || (screen === "ready" && (short || blocked))}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}
