/**
 * The order, written as English. Pure — no React, no network, no dates.
 *
 * Why this is a module and not three template literals inline: lines are
 * authored as STANDALONE statements ("No large corporations", "Senior IC tracks
 * (staff / principal)"), and dropping a standalone statement into the middle of
 * a sentence is where the old brief broke. It printed "You lean toward Prefers
 * roles in corporate functions … You're heading for No." — three separate
 * grammar failures in one line: a memory string used as a noun phrase, a
 * fragment keeping its sentence case mid-clause, and a junk answer stated as
 * fact.
 *
 * So assembly has rules, and they are testable:
 *   1. the user's own words open the brief and are never rewritten
 *   2. the place is stated ONCE, whichever clause happens to carry it
 *   3. a fragment loses its capital mid-sentence — unless it starts with an
 *      initialism or a proper noun ("senior ic tracks" is not an improvement)
 *   4. about-you lines get a lead-in, never a bare fragment
 *   5. only KEPT lines appear. Nothing else, ever.
 *
 * Both surfaces import this. §6 of the handoff requires the gate and the market
 * sheet to render the identical order string, and one module consumed twice is
 * the only way that is literally true rather than true by inspection.
 */

import type { OrderLine, OrderState } from "./types"

/** Initialisms and names that keep their capital mid-sentence. */
const KEEP_CAPS = /^(IC|AI|CV|SaaS|API|B2B|B2C|ML|UX|HR|Bengaluru|Bangalore|Mumbai|Delhi|Hyderabad|Pune|Chennai|India|Myro)\b/

/**
 * A capitalised word followed by another capital — "South Bengaluru", "Senior
 * IC tracks", "New Delhi". Lowercasing the first word of one of these turns a
 * place name into a direction ("in south Bengaluru"), so multi-capital openers
 * keep their case. A list of proper nouns could never be long enough; the shape
 * is the signal.
 */
const PROPER_PHRASE = /^[A-Z][\w-]*\s+[A-Z]/

/** Curly punctuation, normalised before anything tries to match on it. A stored
 *  goal reads `Where you’re headed: “No”` with typographic quotes; a regex
 *  written with straight ones silently matches none of it. */
const straighten = (text: string) => text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"')

/** Does the user's own sentence already name where they'll work? */
const NAMES_A_PLACE = /\b(bengaluru|bangalore|mumbai|delhi|ncr|gurgaon|noida|hyderabad|pune|chennai|kolkata|remote|anywhere|onsite|hybrid|wfh)\b/i

const IS_REMOTE = /\bremote\b/i

const strip = (text: string) => text.trim().replace(/\.+$/, "")

/** A fragment mid-sentence loses its sentence case. Never a blanket
 *  toLowerCase — that produces "senior ic tracks" and "bengaluru". */
export function fragment(text: string): string {
  const value = strip(text)
  if (!value || KEEP_CAPS.test(value) || PROPER_PHRASE.test(value)) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}

/** Lines are stored bare; the reader needs the "No " back. */
const asWont = (text: string) => fragment(strip(text).replace(/^no\s+/i, ""))

/** Strip the stored label and any wrapping quotes off an about-you line. */
const bareAbout = (text: string) =>
  strip(straighten(text))
    .replace(/^(where you're headed|where you are headed|best at|aiming for|strongest at)\s*[:—–-]\s*/i, "")
    .replace(/^["']+|["']+$/g, "")
    .trim()

const kept = (order: OrderState, kind: OrderLine["kind"]) =>
  order.lines.filter((line) => line.status === "kept" && line.kind === kind)

const textsOf = (order: OrderState, kind: OrderLine["kind"]) => kept(order, kind).map((l) => strip(l.text))

/** "a" · "a and b" · "a, b and c" — a list read aloud, not a comma-join. */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/**
 * The location sentence — or an empty string when the user already said it.
 *
 * The de-dup exists because both halves of the order can carry a place: the
 * user's opening words ("tech sales in Bengaluru") and a location line Myro
 * proposed. Without this the brief tells you where you'll work twice, in two
 * different registers, which reads as Myro not having listened.
 */
export function placeSentence(said: string, locations: string[]): string {
  if (locations.length === 0) return ""
  const stated = NAMES_A_PLACE.test(said)
  const place = joinWords(locations.map(fragment))
  if (!stated) return `In ${place}.`
  // They named a place; the only thing left worth adding is a remote option
  // they did not mention.
  const addsRemote = locations.some((l) => IS_REMOTE.test(l)) && !IS_REMOTE.test(said)
  return addsRemote ? `Also open to ${place}.` : ""
}

/**
 * The brief on the review screen. Built from kept lines and the user's own
 * words, in that order of authority.
 */
export function briefFrom(order: OrderState): string {
  const said = strip(order.said)
  const roles = textsOf(order, "role")

  // Sentence one is the user's sentence. When they never typed one — they came
  // in through the market sheet, or ran on a stored order — the roles stand in.
  const opening = said
    ? `Look for ${said}.`
    : roles.length
      ? `Look for ${joinWords(roles.map(fragment))}.`
      : ""

  const place = placeSentence(said || roles.join(" "), textsOf(order, "location"))
  const drawn = textsOf(order, "lean").map(fragment)
  const wont = textsOf(order, "wont_take").map(asWont)
  const floors = textsOf(order, "pay_floor").map(fragment)

  const goal = kept(order, "goal")[0]
  const power = kept(order, "strength")[0]

  return [
    opening,
    place,
    drawn.length ? `Lean toward ${drawn.join("; ")}.` : "",
    wont.length ? `Skip ${wont.join(", ")}.` : "",
    floors.length ? `Nothing below ${joinWords(floors)}.` : "",
    goal ? `Aiming for ${fragment(bareAbout(goal.text))}.` : "",
    power ? `Strongest at ${fragment(bareAbout(power.text))}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

/**
 * The market sheet's one-paragraph restatement of the saved order.
 *
 * Shorter than the brief on purpose — the sheet is a place to complain about
 * results, not to re-read your leanings — but it comes off the same lines
 * through the same normalisation, so the two surfaces cannot drift into
 * describing the order differently.
 */
export function orderSummaryFrom(order: OrderState): string {
  const said = strip(order.said)
  const roles = textsOf(order, "role")
  const opening = said || (roles.length ? joinWords(roles) : "")
  const wont = textsOf(order, "wont_take").map(asWont)
  const floors = textsOf(order, "pay_floor").map(fragment)

  return [
    opening ? `${opening}.` : "",
    placeSentence(opening, textsOf(order, "location")),
    wont.length ? `No ${wont.join(", ")}.` : "",
    floors.length ? `Nothing below ${joinWords(floors)}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

export interface OrderCounts {
  kept: number
  dropped: number
  unanswered: number
  fromMarket: number
}

export function countsFrom(order: OrderState): OrderCounts {
  return {
    kept: order.lines.filter((l) => l.status === "kept").length,
    dropped: order.lines.filter((l) => l.status === "dropped").length,
    unanswered: order.lines.filter((l) => l.status === "unanswered").length,
    fromMarket: order.lines.filter((l) => l.status === "kept" && l.origin === "market").length,
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/**
 * The promise under the brief. This sentence is the whole surface's contract,
 * so it counts what actually happens rather than what the screen implies: an
 * unanswered guess is DROPPED at run time, and saying so is the difference
 * between a confirmation screen and a consent screen.
 */
/**
 * What the run bar says while a slot is still contested.
 *
 * `contractLine` cannot answer this. `order.used` counts only lines the
 * resolver actually placed into the six-slot spec, and an over-arity slot
 * contributes NOTHING — `payload.py` skips the whole group. A user with three
 * contested slots therefore gets `used === 0`, and the contract sentence reads
 * "Myro runs on the 0 lines above and nothing else" underneath twenty visible
 * plates. That shipped on 2026-08-19. It is not a rounding error; it is the
 * surface stating the opposite of what is on screen.
 *
 * So while anything is contested the bar states the block instead of the
 * count. The count is only meaningful once the resolver can place every slot.
 */
export function blockedLine(contested: number): string {
  const q = `${contested} ${plural(contested, "question", "questions")}`
  return `${q} above still open — Myro runs once ${plural(contested, "it's", "they're")} settled.`
}

export function contractLine(order: OrderState): string {
  const { kept: keptCount, dropped, unanswered, fromMarket } = countsFrom(order)
  const runCount = typeof order.used === "number" ? order.used : keptCount
  const lines = `${runCount} ${plural(runCount, "line", "lines")}`
  const market = fromMarket
    ? ` ${fromMarket} ${plural(fromMarket, "line", "lines")} came from the market sheet — ${plural(fromMarket, "it's", "they're")} part of the same order.`
    : ""

  if (dropped + unanswered === 0) {
    return `Nothing dropped — Myro runs on all ${lines} above and nothing else.${market}`
  }
  // "line", not "guess": a line the user said no to may well have been their
  // own — the goal that read "No" is `you said this`. Naming everything a
  // guess here would tell them Myro proposed something they typed.
  const said = dropped ? `${dropped} ${plural(dropped, "line", "lines")} you said no to` : ""
  const left = unanswered ? `${unanswered} left unanswered` : ""
  const both = [said, left].filter(Boolean).join(", ")
  return `${both} — all dropped. Myro runs on the ${lines} above and nothing else.${market}`
}
