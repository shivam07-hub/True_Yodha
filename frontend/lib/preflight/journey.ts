/**
 * Myro Search as a journey — five steps over the same six-slot Order.
 *
 * The modal used to be ONE canvas holding everything: six slot groups, the
 * facts, the say band, the heard fold, the undo row and the run bar, stacked
 * in a 640px box. A typical order came to ~1,100px, so signing off meant
 * scrolling past two screens to reach the only button that does anything.
 *
 * Steps fix that by asking one thing at a time. The risk they carry is the
 * opposite one — a user whose order is already right should not tap Continue
 * four times to change nothing — and the answer to it is the LANDING RULE
 * below: the journey opens on the first step that still needs the user, which
 * for a settled order is Sign off. Nothing Myro already knows is asked again.
 * That is also the whole "it remembers me" feeling, and it is a rule rather
 * than a decoration.
 *
 * Pure. No React, no network, no dates — the step machine is the part worth
 * testing, and it is testable only if it stays a function of the Order.
 */

import type { LineKind, Order, OrderConflict, OrderProposal, SlotKey } from "./types"

export type StepKey = "work" | "where" | "preferences" | "about" | "signoff"

export interface StepDef {
  key: StepKey
  /** A noun. Page titles are nouns here even in a guided flow — the reference
   *  designs ask questions ("What role do you want to find?"); Myro's copy law
   *  does not, and the lede below does the human work instead. */
  title: string
  /** One line, under the title. Says what the step is FOR, never what the
   *  screen already shows. */
  lede: string
  /** The slots this step edits, in render order. */
  slots: SlotKey[]
  /** A step that can be passed with nothing in it. The work cannot: an order
   *  with no role is not a broad search, it is no search, and `/preflight/run`
   *  refuses it. */
  optional: boolean
}

export const STEPS: readonly StepDef[] = [
  {
    key: "work",
    title: "The work",
    lede: "Myro searches on these titles. Add every one you would take.",
    slots: ["target_role_titles"],
    optional: false,
  },
  {
    key: "where",
    title: "Where",
    lede: "Cities you would actually move for, or remote.",
    slots: ["target_locations"],
    optional: true,
  },
  {
    key: "preferences",
    // Not "Filters": a lean tilts ranking and never excludes, so a title
    // calling both halves a filter would be stating the opposite of the rule
    // the Drawn to group runs on.
    title: "Preferences",
    lede: "What you would turn down, and what pulls you toward a role.",
    slots: ["deal_breakers", "lean"],
    optional: true,
  },
  {
    key: "about",
    title: "About you",
    lede: "Where this is heading, and what you are strongest at.",
    slots: ["career_goal", "superpower"],
    optional: true,
  },
  {
    key: "signoff",
    title: "Sign off",
    lede: "Everything Myro will run on, in one place.",
    slots: [],
    optional: false,
  },
]

export const STEP_KEYS: readonly StepKey[] = STEPS.map((s) => s.key)

export function stepAt(index: number): StepDef {
  return STEPS[Math.min(Math.max(index, 0), STEPS.length - 1)]
}

export function indexOfStep(key: StepKey): number {
  const at = STEPS.findIndex((s) => s.key === key)
  return at === -1 ? 0 : at
}

/**
 * Which step a loose line or guess belongs on.
 *
 * A guess about a city belongs beside the Where slot, not in a pile at the
 * bottom of everything — the shipped surface put all twenty in one fold, so
 * the question and the thing it was about were never on screen together.
 *
 * `fact` files to no slot at all (a notice period, a visa status) and is shown
 * on About you, which is what it is about.
 */
const KIND_STEP: Record<LineKind, StepKey> = {
  role: "work",
  location: "where",
  wont_take: "preferences",
  pay_floor: "preferences",
  lean: "preferences",
  goal: "about",
  strength: "about",
  fact: "about",
}

export function stepForKind(kind: LineKind): StepKey {
  return KIND_STEP[kind]
}

const SLOT_STEP: Record<SlotKey, StepKey> = {
  target_role_titles: "work",
  target_locations: "where",
  deal_breakers: "preferences",
  lean: "preferences",
  career_goal: "about",
  superpower: "about",
}

export function stepForSlot(slot: SlotKey): StepKey {
  return SLOT_STEP[slot]
}

/**
 * A proposal's home, taken from what it would DO.
 *
 * A proposal carries an `eyebrow` for display and `effects` for meaning. The
 * eyebrow is prose ("WON'T TAKE"); the effect names a `kind`. Route on the
 * kind, and when a proposal carries no typed effect send it to Sign off rather
 * than dropping it — an unroutable guess that renders nowhere is a guess the
 * user is never asked about and that the run then discards silently.
 */
export function stepForProposal(proposal: OrderProposal): StepKey {
  for (const effect of proposal.effects) {
    if (effect.kind) return stepForKind(effect.kind)
  }
  return "signoff"
}

export interface StepNeed {
  /** The step cannot be passed — the work slot is empty, or a slot on this
   *  step has a live conflict the resolver refuses to run through. */
  blocking: boolean
  /** Guesses waiting for a yes or no on this step. Not blocking: an unanswered
   *  guess is DROPPED at run time, which is a valid answer and stated on the
   *  Sign off contract line. */
  guesses: number
}

/**
 * What each step still wants from the user.
 *
 * Drives three things at once: the landing, the ribbon's dot, and whether the
 * footer's secondary control reads "Skip for now" or is absent. One rule, so
 * the ribbon cannot say a step is settled while the footer offers to skip it.
 */
export function needsByStep(
  order: Order | undefined,
  conflicts: OrderConflict[],
  proposals: OrderProposal[],
  answered: Record<string, unknown>,
): Record<StepKey, StepNeed> {
  const need: Record<StepKey, StepNeed> = {
    work: { blocking: false, guesses: 0 },
    where: { blocking: false, guesses: 0 },
    preferences: { blocking: false, guesses: 0 },
    about: { blocking: false, guesses: 0 },
    signoff: { blocking: false, guesses: 0 },
  }
  if (!order) return need

  const hasRole = order.lines.some((l) => l.status === "kept" && l.kind === "role")
  if (!hasRole) need.work.blocking = true

  for (const conflict of conflicts) {
    const step = SLOT_STEP[conflict.slot as SlotKey]
    if (step) need[step].blocking = true
  }

  for (const line of order.lines) {
    if (line.status !== "unanswered") continue
    need[stepForKind(line.kind)].guesses += 1
  }

  for (const proposal of proposals) {
    if (answered[proposal.id] !== undefined && answered[proposal.id] !== null) continue
    need[stepForProposal(proposal)].guesses += 1
  }

  return need
}

/**
 * Where the journey opens.
 *
 * The first step that still needs something, else Sign off. A returning user
 * whose order is settled lands one tap from Run; a user Myro has a question
 * for lands on the question. `intent: "say"` overrides it — that door promised
 * the say band, which lives on Sign off.
 */
export function landingStep(
  need: Record<StepKey, StepNeed>,
  intent?: "review" | "say" | null,
): StepKey {
  if (intent === "say") return "signoff"
  for (const step of STEPS) {
    const n = need[step.key]
    if (n.blocking || n.guesses > 0) return step.key
  }
  return "signoff"
}
