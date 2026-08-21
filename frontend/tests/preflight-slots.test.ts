/**
 * The client's six slots must be the server's six slots.
 *
 * `lib/preflight/slots.ts` is a hand-maintained mirror of `SLOT_ARITY` and
 * `_SLOT_KINDS` in `backend/app/services/preflight/payload.py`. Two copies of
 * one contract drift, and the drift is invisible: a `location` line filed
 * under "Won't take" on screen while the resolver puts it in
 * `target_location` looks like a rendering quirk, not a broken spec.
 *
 * So this test reads the Python and asserts the two agree — key for key,
 * arity for arity, kind for kind. It fails loudly the day someone widens a
 * slot on one side only.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { SLOTS, slotCount, slotForKind } from "../lib/preflight/slots"

const payload = readFileSync(
  new URL("../../backend/app/services/preflight/payload.py", import.meta.url),
  "utf8",
)

/** Pull a `name: dict[...] = { ... }` literal out of the Python source. */
function pyBlock(name: string): string {
  const start = payload.indexOf(`${name}:`)
  assert.ok(start > -1, `${name} not found in payload.py`)
  const open = payload.indexOf("{", start)
  const close = payload.indexOf("}", open)
  return payload.slice(open, close + 1)
}

test("arity matches the resolver, slot for slot", () => {
  const block = pyBlock("SLOT_ARITY")
  const serverArity = new Map<string, number>()
  for (const [, key, n] of block.matchAll(/"([a-z_]+)":\s*(\d+)/g)) {
    serverArity.set(key, Number(n))
  }

  assert.equal(SLOTS.length, serverArity.size, "six slots on both sides")
  for (const spec of SLOTS) {
    assert.ok(serverArity.has(spec.key), `${spec.key} is not a server slot`)
    assert.equal(
      spec.arity,
      serverArity.get(spec.key),
      `${spec.key} arity drifted from payload.py`,
    )
  }
})

test("every line kind files to the slot the resolver files it to", () => {
  const block = pyBlock("_SLOT_KINDS")
  const serverKinds = new Map<string, string[]>()
  for (const [, key, kinds] of block.matchAll(/"([a-z_]+)":\s*\(([^)]*)\)/g)) {
    serverKinds.set(key, [...kinds.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]))
  }

  for (const spec of SLOTS) {
    const server = serverKinds.get(spec.key)
    assert.ok(server, `${spec.key} has no kinds in payload.py`)
    assert.deepEqual(
      [...spec.kinds].sort(),
      [...server].sort(),
      `${spec.key} kinds drifted from payload.py`,
    )
    // The add chip must create something this slot actually accepts.
    assert.ok(
      spec.kinds.includes(spec.addKind),
      `${spec.key} adds a ${spec.addKind}, which it does not hold`,
    )
    for (const kind of spec.kinds) {
      assert.equal(slotForKind(kind), spec.key, `${kind} routes to the wrong slot`)
    }
  }
})

test("the count appears only when the limit is in play", () => {
  const wide = SLOTS.find((s) => s.arity === 6)!
  const single = SLOTS.find((s) => s.arity === 1)!
  // Room left is legible from the plates themselves.
  assert.equal(slotCount(wide, 0), null)
  assert.equal(slotCount(wide, 5), null)
  // At the limit, and over it, the number is the whole point.
  assert.equal(slotCount(wide, 6), "6 of 6")
  assert.equal(slotCount(wide, 9), "9 of 6")
  // "1 of 1" is the plate restated; the over-case is the conflict plate's job.
  assert.equal(slotCount(single, 0), null)
  assert.equal(slotCount(single, 1), null)
  assert.equal(slotCount(single, 2), null)
})

test("every slot invites in the reader's words, not the schema's", () => {
  for (const spec of SLOTS) {
    // The label is a heading: short, plain, no schema noise.
    assert.ok(spec.label.split(" ").length <= 3, `"${spec.label}" is too long for a header`)
    assert.doesNotMatch(spec.label, /target_|_titles|slot|superpower/i)
    // The invite doubles as the empty state, so it reads as a thing to say,
    // never as a command ("Add location").
    assert.doesNotMatch(spec.invite, /^add\b/i, `"${spec.invite}" is a command, not an invitation`)
    assert.ok(spec.invite.length > 0)
  }
})
