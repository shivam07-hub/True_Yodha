"use client"

/**
 * Myro Search, as five steps over one Order.
 *
 * This replaces `<ScreenCanvas>`, which put everything the Order has — six slot
 * groups, the facts, the say band, the heard fold, the undo row and the run bar
 * — into a single 640px scroll. Measured on a real order that came to ~1,100px,
 * so the button that charges the user sat two screens below the fold and the
 * question "what does Myro still need from me?" could only be answered by
 * reading all of it.
 *
 * Three things carry the fix, and the second is the one that makes the first
 * safe:
 *
 *   1. ONE DECISION PER SCREEN. Five steps, a title, and the slots that step
 *      edits. Guesses render beside the slot they would change instead of in
 *      a pile at the bottom.
 *   2. THE LANDING RULE. `landingStep` opens the journey on the first step
 *      that still needs the user — which for a settled order is Sign off, one
 *      tap from Run. A returning user is never walked through four screens to
 *      confirm what Myro already knows. Steps are for filling; they are not a
 *      toll on running.
 *   3. A PINNED FOOTER. The primary action never scrolls away.
 *
 * The shell (`PreflightGate`) still owns the modal, the escape key and the
 * network. This owns which step is on screen and what the footer says.
 */

import { useMemo, useState } from "react"

import { visibleConflicts } from "@/lib/preflight/conflicts"
import {
  STEPS,
  indexOfStep,
  landingStep,
  needsByStep,
  stepForKind,
  stepForProposal,
  type StepKey,
} from "@/lib/preflight/journey"
import { factsFrom, groupsFrom, groupsInStepOrder } from "@/lib/preflight/derive"
import type {
  LineKind,
  LineStatus,
  Order,
  OrderLogEntry,
  OrderPrice,
  OrderProposal,
} from "@/lib/preflight/types"

import { JourneyFooter } from "./journey-footer"
import { PreflightHeader } from "./preflight-header"
import { StepOpen } from "./step-open"
import { StepSignoff } from "./step-signoff"
import { StepSlot } from "./step-slot"

type Verdict = "kept" | "dropped" | null

export function Journey({
  order,
  proposals,
  proposalAnswers,
  pending,
  intent,
  price,
  balance,
  starting,
  error,
  closable,
  onClose,
  onSaySomething,
  onProposeTopic,
  onAnswerLine,
  onRewordLine,
  onAnswerProposal,
  onAddLine,
  undoable,
  onUndo,
  onOpenCoins,
  onRun,
}: {
  order: Order
  proposals: OrderProposal[]
  proposalAnswers: Record<string, Verdict>
  pending: boolean
  intent: "review" | "say" | null
  /** null until `GET /preflight/price` lands. Every step works while it is
   *  null — only Run waits, because pressing it unpriced would be consenting
   *  to a charge nobody has been shown. */
  price: OrderPrice | null
  balance: number
  starting: boolean
  error: string | null
  closable: boolean
  onClose: () => void
  onSaySomething: (text: string) => void
  onProposeTopic: (topic: string) => void
  onAnswerLine: (lineId: string, status: LineStatus) => void
  onRewordLine: (lineId: string, text: string) => void
  onAnswerProposal: (id: string, verdict: Verdict) => void
  onAddLine: (kind: LineKind, text: string, roleFamily?: string) => void
  undoable: OrderLogEntry | null
  onUndo: (entryId: string) => void
  onOpenCoins: () => void
  onRun: () => void
}) {
  const conflicts = visibleConflicts(order)

  // Both derivations are pure and live in `derive.ts` — see the note there on
  // why the client no longer files lines into slots itself.
  const groupsByKey = useMemo(() => groupsFrom(order, conflicts), [order, conflicts])
  const facts = useMemo(() => factsFrom(order), [order])

  const unanswered = useMemo(
    () => order.lines.filter((l) => l.status === "unanswered"),
    [order.lines],
  )
  const liveProposals = useMemo(
    () => proposals.filter((p) => !proposalAnswers[p.id]),
    [proposals, proposalAnswers],
  )

  const need = useMemo(
    () => needsByStep(order, conflicts, proposals, proposalAnswers),
    [order, conflicts, proposals, proposalAnswers],
  )

  // ── which step ─────────────────────────────────────────────────────────────
  // The landing is computed ONCE, from the order as it first arrived — a lazy
  // initialiser, not an effect. Recomputing it as the user answers things
  // would move the screen out from under them: answering the last guess on
  // Where would re-land the journey on Sign off mid-tap. The shell only mounts
  // this once the order has landed, so the first render already has the real
  // answer rather than a placeholder to correct later.
  const [index, setIndex] = useState(() => indexOfStep(landingStep(need, intent)))
  const step = STEPS[index]
  const isLast = index === STEPS.length - 1
  const goTo = (next: number) => setIndex(Math.min(Math.max(next, 0), STEPS.length - 1))
  const jump = (key: StepKey) => goTo(indexOfStep(key))

  // ── what this step holds ───────────────────────────────────────────────────
  const groups = useMemo(
    () => step.slots.flatMap((key) => {
      const group = groupsByKey.get(key)
      return group ? [group] : []
    }),
    [step, groupsByKey],
  )
  const stepGuesses = useMemo(
    () => unanswered.filter((l) => stepForKind(l.kind) === step.key),
    [unanswered, step.key],
  )
  const stepProposals = useMemo(
    () => liveProposals.filter((p) => stepForProposal(p) === step.key),
    [liveProposals, step.key],
  )

  const hasRole = order.lines.some((l) => l.status === "kept" && l.kind === "role")
  /** The order is untouched — no kept line, no conflict, nothing said. The work
   *  step then opens with a composer as well as its picker. */
  const blank =
    order.lines.every((l) => l.status !== "kept") &&
    conflicts.length === 0 &&
    (order.said ?? "").trim().length === 0

  const title = useMemo(() => {
    const work = groupsByKey.get("target_role_titles")
    return (work?.lines ?? []).map((l) => l.text).join(" · ")
  }, [groupsByKey])

  /** Every slot, in step order — which is also the order that runs from the
   *  thing DEFINING the search to the thing that only colours it. */
  const allGroups = useMemo(() => groupsInStepOrder(groupsByKey), [groupsByKey])

  /** Only where there is genuinely something to skip. "Skip for now" under a
   *  step the user has already filled offers to skip nothing. */
  const skippable =
    !isLast &&
    step.optional &&
    groups.every((g) => g.lines.length === 0) &&
    stepGuesses.length === 0 &&
    stepProposals.length === 0

  return (
    <>
      <PreflightHeader
        current={step.key}
        need={need}
        onBack={index > 0 ? () => goTo(index - 1) : null}
        onJump={jump}
        onClose={onClose}
        closable={closable}
      />

      <div className="pf-body">
        {step.key === "work" && blank ? (
          <StepOpen order={order} price={price} pending={pending} onSubmit={onSaySomething} />
        ) : null}

        {isLast ? (
          <StepSignoff
            order={order}
            title={title}
            groups={allGroups}
            facts={facts}
            guesses={unanswered.filter((l) => stepForKind(l.kind) === "signoff")}
            proposals={stepProposals}
            proposalAnswers={proposalAnswers}
            sayFirst={intent === "say"}
            busy={pending}
            onAdd={onAddLine}
            onAnswerLine={onAnswerLine}
            onRewordLine={onRewordLine}
            onAnswerProposal={onAnswerProposal}
            onSaySomething={onSaySomething}
            onProposeTopic={onProposeTopic}
          />
        ) : (
          <StepSlot
            step={step}
            groups={groups}
            memoryCount={order.memory_count}
            guesses={stepGuesses}
            proposals={stepProposals}
            proposalAnswers={proposalAnswers}
            facts={step.key === "about" ? facts : undefined}
            busy={pending}
            onAdd={onAddLine}
            onAnswerLine={onAnswerLine}
            onRewordLine={onRewordLine}
            onAnswerProposal={onAnswerProposal}
          />
        )}
      </div>

      <JourneyFooter
        order={order}
        conflicts={conflicts}
        hasRole={hasRole}
        isLast={isLast}
        stepKey={step.key}
        price={price}
        balance={balance}
        starting={starting}
        pending={pending}
        error={error}
        undoable={undoable}
        skippable={skippable}
        onUndo={onUndo}
        onOpenCoins={onOpenCoins}
        onRun={onRun}
        onNext={() => goTo(index + 1)}
      />
    </>
  )
}
