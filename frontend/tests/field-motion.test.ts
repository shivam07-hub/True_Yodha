import test from "node:test"
import assert from "node:assert/strict"

import {
  createFieldMotion,
  shouldAnimateField,
  type FieldMotionDeps,
  type FieldParticle,
} from "../components/loading/field-motion"

/** Fake event target / document that records listener add/remove calls. */
function fakeListenable() {
  const added: string[] = []
  const removed: string[] = []
  const handlers = new Map<string, (e: Event) => void>()
  return {
    added,
    removed,
    handlers,
    addEventListener(type: string, fn: (e: Event) => void) {
      added.push(type)
      handlers.set(type, fn)
    },
    removeEventListener(type: string) {
      removed.push(type)
    },
  }
}

type RafHarness = {
  raf: (cb: (t: number) => void) => number
  caf: (id: number) => void
  /** run the most recently scheduled callback (simulating a frame). */
  flush: () => void
  scheduled: () => number
  cancelled: number[]
}

function rafHarness(): RafHarness {
  let nextId = 1
  let pending: { id: number; cb: (t: number) => void } | null = null
  const cancelled: number[] = []
  let frame = 0
  return {
    raf(cb) {
      const id = nextId++
      pending = { id, cb }
      return id
    },
    caf(id) {
      cancelled.push(id)
      if (pending && pending.id === id) pending = null
    },
    flush() {
      const p = pending
      if (!p) return
      pending = null
      frame += 16
      p.cb(frame)
    },
    scheduled() {
      return pending ? pending.id : 0
    },
    cancelled,
  }
}

function buildDeps(over: Partial<FieldMotionDeps> = {}): {
  deps: FieldMotionDeps
  target: ReturnType<typeof fakeListenable>
  doc: ReturnType<typeof fakeListenable> & { hidden: boolean }
  raf: RafHarness
  applied: number[][]
} {
  const target = fakeListenable()
  const docBase = fakeListenable()
  const doc = Object.assign(docBase, { hidden: false })
  const raf = rafHarness()
  const applied: number[][] = []
  const particles: FieldParticle[] = [
    { base: { x: 0.5, y: 0.5 }, phase: 0, apply: (tx, ty) => applied.push([tx, ty]) },
  ]
  const deps: FieldMotionDeps = {
    particles,
    getRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    target,
    doc,
    raf: raf.raf,
    caf: raf.caf,
    now: () => 0,
    ...over,
  }
  return { deps, target, doc, raf, applied }
}

test("shouldAnimateField: interactive and not reduced → animate", () => {
  assert.equal(shouldAnimateField(true, false), true)
})

test("shouldAnimateField: reduced-motion always wins (static rim only)", () => {
  assert.equal(shouldAnimateField(true, true), false)
  assert.equal(shouldAnimateField(false, false), false)
  assert.equal(shouldAnimateField(false, true), false)
})

test("start registers exactly the three listeners + one rAF", () => {
  const { deps, target, doc, raf } = buildDeps()
  const m = createFieldMotion(deps)
  m.start()
  assert.deepEqual(target.added, ["pointermove", "touchmove"])
  assert.deepEqual(doc.added, ["visibilitychange"])
  assert.equal(raf.scheduled() !== 0, true, "a frame is scheduled")
})

test("stop hard-tears-down: every listener removed + rAF cancelled, no reschedule", () => {
  const { deps, target, doc, raf } = buildDeps()
  const m = createFieldMotion(deps)
  m.start()
  const liveId = raf.scheduled()
  m.stop()

  assert.deepEqual(target.removed, ["pointermove", "touchmove"])
  assert.deepEqual(doc.removed, ["visibilitychange"])
  assert.equal(raf.cancelled.includes(liveId), true, "the live frame was cancelled")
  assert.equal(raf.scheduled(), 0, "nothing scheduled after stop")

  // A frame already queued before stop must NOT reschedule (the running guard).
  raf.flush()
  assert.equal(raf.scheduled(), 0, "stopped loop does not re-arm itself")
})

test("a running tick reschedules itself (ambient drift keeps going)", () => {
  const { deps, raf, applied } = buildDeps()
  const m = createFieldMotion(deps)
  m.start()
  raf.flush()
  assert.equal(applied.length, 1, "particle transform written once per frame")
  assert.equal(raf.scheduled() !== 0, true, "next frame armed")
  m.stop()
})

test("tab blur pauses the loop; return resumes it", () => {
  const { deps, doc, raf } = buildDeps()
  const m = createFieldMotion(deps)
  m.start()
  const onVis = doc.handlers.get("visibilitychange")!
  const evt = new Event("visibilitychange")

  doc.hidden = true
  onVis(evt)
  assert.equal(raf.scheduled(), 0, "loop paused while hidden")

  doc.hidden = false
  onVis(evt)
  assert.equal(raf.scheduled() !== 0, true, "loop resumed on return")
  m.stop()
})

test("start is idempotent — double start does not double-bind listeners", () => {
  const { deps, target, raf } = buildDeps()
  const m = createFieldMotion(deps)
  m.start()
  m.start()
  assert.deepEqual(target.added, ["pointermove", "touchmove"])
  assert.equal(raf.cancelled.length, 0, "no leaked frame from a second start")
  m.stop()
})
