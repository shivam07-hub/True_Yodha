/**
 * The client must have words for every slot the resolver can send.
 *
 * This test used to assert a MIRROR: `slots.ts` carried each slot's arity and
 * the kinds that file into it, and this read `payload.py` to prove the two
 * copies agreed key-for-key. They did agree, and the surface was still wrong —
 * because the drift that mattered was not in the constants. The server deduped
 * before filing and the client did not, so one statement rendered twice and the
 * header counted both (`Won't take · 15 of 6`). A drift detector over two
 * implementations cannot catch a difference in what the two implementations DO.
 *
 * So the contract moved: the resolver sends its own partition (`order.slots` —
 * key, arity, placed line ids, contested line ids) and the client owns only the
 * copy. What is left to check is completeness — a slot the server can emit and
 * the client cannot name renders as a blank header — and that the copy reads
 * like a person wrote it.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { SLOT_COPY, slotCount } from "../lib/preflight/slots"
import { STEPS } from "../lib/preflight/journey"

/** `spec.py`, not `payload.py`: the slot map moved there on 2026-08-25 when the
 *  meaning of an EMPTY slot became a contract of its own. This test failing on
 *  that move is the detector working — the path is half the contract. */
const spec = readFileSync(
  new URL("../../backend/app/services/preflight/spec.py", import.meta.url),
  "utf8",
)

/** Pull a `name: dict[...] = { ... }` literal out of the Python source. */
function pyBlock(name: string): string {
  const start = spec.indexOf(`${name}:`)
  assert.ok(start > -1, `${name} not found in spec.py`)
  const open = spec.indexOf("{", start)
  const close = spec.indexOf("}", open)
  return spec.slice(open, close + 1)
}

/** Keys, not values. The arity may be a literal or a shared constant —
 *  `target_locations` takes `MAX_TARGET_LOCATIONS`, the same cap
 *  `targeting_write` enforces on the column, precisely so the number is not
 *  written down twice. A pattern that only matched digits made that slot
 *  invisible here, which reads as "the client has words for a slot the server
 *  never sends" — the failure mode inverted. */
const serverKeys = [...pyBlock("SLOT_ARITY").matchAll(/"([a-z_]+)":\s*\w+/g)].map((m) => m[1])

test("every slot the resolver can send has words on the client", () => {
  assert.ok(serverKeys.length > 0, "no slots parsed out of spec.py")
  for (const key of serverKeys) {
    assert.ok(key in SLOT_COPY, `${key} would render as a blank header`)
  }
  // And nothing the other way: copy for a slot the server never sends is a
  // group that can only ever be empty.
  for (const key of Object.keys(SLOT_COPY)) {
    assert.ok(serverKeys.includes(key), `${key} is not a server slot`)
  }
  // The steps are where render order lives, so they are what must cover the
  // server's slots — a slot assigned to no step is one the user cannot reach,
  // and a step naming a slot the server never sends is a group that can only
  // ever be empty.
  const stepped = STEPS.flatMap((step) => step.slots)
  assert.deepEqual([...stepped].sort(), [...serverKeys].sort())
  assert.equal(new Set(stepped).size, stepped.length, "a slot may belong to one step")
})

test("the client owns the words and nothing else", () => {
  // Arity and kinds are the resolver's. A copy of either here is a second
  // implementation waiting to disagree with the run.
  const source = readFileSync(new URL("../lib/preflight/slots.ts", import.meta.url), "utf8")
  const body = source.slice(source.indexOf("export const SLOT_COPY"))
  assert.doesNotMatch(body, /arity:\s*\d/, "arity belongs to the resolver")
  assert.doesNotMatch(body, /kinds:\s*\[/, "kind filing belongs to the resolver")
})

test("every slot invites in the reader's words, not the schema's", () => {
  for (const [key, copy] of Object.entries(SLOT_COPY)) {
    // The label is a heading: short, plain, no schema noise.
    assert.ok(copy.label.split(" ").length <= 3, `"${copy.label}" is too long for a header`)
    assert.doesNotMatch(copy.label, /target_|_titles|slot|superpower/i, key)
    // The invite doubles as the empty state, so it reads as a thing to say,
    // never as a command ("Add location").
    assert.doesNotMatch(copy.invite, /^add\b/i, `"${copy.invite}" is a command, not an invitation`)
    assert.ok(copy.invite.length > 0)
  }
})

test("the count appears only when the limit is in play", () => {
  // Room left is legible from the plates themselves.
  assert.equal(slotCount(6, 0), null)
  assert.equal(slotCount(6, 5), null)
  // At the limit, and over it, the number is the whole point.
  assert.equal(slotCount(6, 6), "6 of 6")
  assert.equal(slotCount(6, 9), "9 of 6")
  // "1 of 1" is the plate restated; the over-case is the conflict plate's job.
  assert.equal(slotCount(1, 0), null)
  assert.equal(slotCount(1, 1), null)
  assert.equal(slotCount(1, 2), null)
})
