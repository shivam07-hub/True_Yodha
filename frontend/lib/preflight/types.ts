/**
 * The order Myro runs on — one typed line at a time.
 *
 * The old pre-flight held a bag of strings, so a memory note and something the
 * user typed were the same kind of thing by the time they reached the screen.
 * A line carries its own provenance and its own answer, which is what lets one
 * guess be judged without rewriting the rest.
 *
 * Mirrors `backend/app/services/preflight/lines.py`. `ref` is deliberately not
 * here: it is the server's dedupe key, and a client that could address a line by
 * its source would be able to answer for a note it never rendered.
 */

/** `fact` is true of the person and actionable by nobody — a notice period, a
 *  visa status. The resolver files it to no slot, so it never spends a slot
 *  budget and is never deleted. Server-side `normalise` is its only producer. */
export type LineKind =
  | "role" | "location" | "wont_take" | "lean" | "goal" | "strength" | "pay_floor" | "fact"
export type LineSource = "user_said" | "myro_inferred" | "from_cv" | "user_reworded"
export type LineStatus = "kept" | "dropped" | "unanswered"
export type LineOrigin = "preflight" | "market" | "cv_import" | "memory_import"
export type RoundKey = "wont" | "drawn" | "about"

export interface OrderLine {
  id: string
  kind: LineKind
  /** One statement. No trailing period, no leading "No " — `prose` adds both
   *  back where the grammar wants them. */
  text: string
  source: LineSource
  source_note?: string | null
  origin: LineOrigin
  status: LineStatus
  /** A lean, not a hard exclusion. The row says so rather than filing it as a
   *  filter — a soft note promoted to a hard one is how a search returns none. */
  soft?: boolean
  /** Myro cannot run this. Offers `reword` / `no` only — never `yes`. */
  unusable?: boolean
  original_text?: string | null
  answered_at?: string | null
}

export interface OrderLogEntry {
  id: string
  kind: "add" | "drop" | "keep" | "reword"
  line_id: string
  text: string
}

export type ConflictKind = "arity" | "contradiction" | "value_clash"

export type SlotKey =
  | "target_role_titles"
  | "target_locations"
  | "deal_breakers"
  | "lean"
  | "career_goal"
  | "superpower"

export interface OrderConflict {
  slot: string
  kind: ConflictKind
  line_ids: string[]
  texts: string[]
  keep: number
}

/**
 * One of the six slots, as the resolver left it.
 *
 * `line_ids` is the PLACED set — deduped, uncontested, within arity, and
 * identical to what reaches the profile patch. The client renders these; it no
 * longer files lines into slots itself. Two resolvers is how the screen came to
 * show duplicates the server had already collapsed, then count them.
 */
export interface OrderSlot {
  key: SlotKey
  arity: number
  line_ids: string[]
  contested_ids: string[]
}

/** What every mutation returns. */
export interface OrderState {
  said: string
  lines: OrderLine[]
  log: OrderLogEntry[]
  updated_at?: string | null
  last_run_at?: string | null
  /** Lines the resolver will actually run on. Contested slots are omitted. */
  used?: number
  /** The resolver's own partition of the order. Absent only on a fixture. */
  slots?: OrderSlot[]
  conflicts?: OrderConflict[]
  /** Kept line ids that fill no slot — shown, never run, never deleted. */
  facts?: string[]
}

/** The opening read — adds the parts that don't move when a line is answered. */
export interface Order extends OrderState {
  memory_count: number
  cv_readiness: string | null
}

/**
 * What a run costs, on its own request.
 *
 * It used to ride on `Order`, and pricing it needs a count that read-timed-out
 * at 8s repeatedly in prod — so the plates, the say band and every edit waited
 * on a number that only decides what the button says. Its own query key, its
 * own pending state, blocking only the button.
 *
 * Server-decided. Never price a run from a client constant: that is how a
 * "free" promise and a 100-coin debit end up on the same screen.
 */
export interface OrderPrice {
  run_cost: number
  new_jobs_count: number
}

export interface OrderEffect {
  op: "add" | "drop"
  kind?: LineKind | null
  text: string
  line_id?: string | null
  /** "new line · won't take", or why a line is being struck. */
  label: string
}

export interface OrderProposal {
  id: string
  /** The field this touches — LOCATION, WON'T TAKE, DRAWN TO. */
  eyebrow: string
  value: string
  why: string
  effects: OrderEffect[]
  /** Widening needs a fresh scan of roles nothing has rated, so it costs a run. */
  costly: boolean
}

export interface OrderProposals {
  reply: string | null
  proposals: OrderProposal[]
}

export interface OrderRunResult {
  ticket_id: string
  cost: number
  progress_label: string
  state: "queued" | "computing" | "done"
  /** null when the run was free — no charge, so no new balance. */
  new_coin_balance: number | null
  kept: number
  dropped: number
  unanswered: number
}

export const ROUND_LABEL: Record<RoundKey, string> = {
  wont: "Won't take",
  drawn: "Drawn to",
  about: "About you",
}

/**
 * One line each. Not a length preference — the lead is supporting copy, and
 * supporting copy holds its line count (`.tm-clamp-1`); a two-line question
 * starts competing with the answers underneath it and moves the rows every
 * time the wording changes.
 *
 * They can be this short because the screen already says the rest: the tally
 * button names the round, the source chip says where each line came from, and
 * the note under it says how sure Myro is. The lead only has to ask.
 */
export const ROUND_LEAD: Record<RoundKey, string> = {
  wont: "Which of these are actually true?",
  drawn: "These tilt ranking, never exclude.",
  about: "Which should Myro run on?",
}

/** The chip under a guess. Never rendered from the raw source value — the whole
 *  point is that the user can see where a line came from. */
export const SOURCE_LABEL: Record<LineSource, string> = {
  user_said: "you said this",
  myro_inferred: "Myro inferred",
  from_cv: "from your CV",
  user_reworded: "your words, just now",
}

/** The field a line fills — same labels the proposals screen already uses. */
export const KIND_EYEBROW: Record<LineKind, string> = {
  location: "LOCATION",
  wont_take: "WON'T TAKE",
  lean: "DRAWN TO",
  role: "THE WORK",
  pay_floor: "PAY FLOOR",
  goal: "WHERE YOU'RE HEADED",
  strength: "BEST AT",
  fact: "ON YOUR PROFILE",
}
