/**
 * Headless motion engine for <AccentField> — the cursor/touch-reactive accent-edge
 * loading playground (dashboard-loading grill Q6/Q8/Q9).
 *
 * Pulled out of the React component on purpose: the load-bearing part of the
 * contract is the PERF/teardown behaviour, not the JSX. With every dependency
 * injected (event targets, rAF pair, clock) the whole engine runs in plain Node
 * with fakes, so a test can prove the hard-teardown guarantee — every listener
 * removed and the rAF cancelled the instant the section resolves and the field
 * unmounts. A reactive loader still ticking after content paints is a battery
 * bug; this is where we guard against it.
 *
 * Contract enforced here:
 *  - transform-only writes (the `apply` callback sets a translate3d; no layout).
 *  - pointer/touch events only STASH the latest position (cheap); all DOM writes
 *    happen in the ONE rAF tick per frame — input is coalesced, never per-event.
 *  - `stop()` is idempotent and removes everything; a tick already queued before
 *    stop never reschedules (the `running` guard short-circuits it).
 *  - tab blur pauses the loop (visibilitychange) and resumes on return.
 */

export type FieldParticle = {
  /** Anchor position within the container, normalised 0..1. */
  base: { x: number; y: number }
  /** Per-particle phase offset so idle drift isn't synchronised. */
  phase: number
  /** Transform-only write: receives px offsets to translate the particle by. */
  apply: (tx: number, ty: number) => void
}

type Rect = { left: number; top: number; width: number; height: number }

// Listener typed as the DOM's own `(e: Event) => void` + `AddEventListenerOptions`
// so the real `window`/`document` are structurally assignable here (a narrower
// custom signature trips strictFunctionTypes against the DOM overloads).
type FieldListener = (e: Event) => void
type Listenable = {
  addEventListener(type: string, fn: FieldListener, opts?: boolean | AddEventListenerOptions): void
  removeEventListener(type: string, fn: FieldListener, opts?: boolean | AddEventListenerOptions): void
}

export interface FieldMotionDeps {
  particles: FieldParticle[]
  /** Container rect for normalising the pointer; null while unmeasured. */
  getRect: () => Rect | null
  /** Pointer/touch source (the real one is `window`). */
  target: Listenable
  /** Visibility source (the real one is `document`), with a live `hidden` flag. */
  doc: Listenable & { readonly hidden: boolean }
  raf: (cb: (t: number) => void) => number
  caf: (id: number) => void
  now: () => number
  /** Idle-drift amplitude in px (ambient motion when no input). */
  driftPx?: number
  /** Max pull toward the pointer in px. */
  pullPx?: number
}

export interface FieldMotionController {
  start: () => void
  stop: () => void
}

/**
 * Resolves whether the field should run its reactive loop at all. Reduced-motion
 * users (or a non-interactive instance) get the static accent rim only — no
 * particles, no listeners, no rAF (grill Q9). Pure so the gate is unit-testable.
 */
export function shouldAnimateField(interactive: boolean, reducedMotion: boolean): boolean {
  return interactive && !reducedMotion
}

export function createFieldMotion(deps: FieldMotionDeps): FieldMotionController {
  const drift = deps.driftPx ?? 6
  const pull = deps.pullPx ?? 18

  // Latest pointer, normalised 0..1 of the container. Listeners only write here;
  // the rAF tick reads it — that is the coalescing (one DOM pass per frame).
  const pointer = { x: 0.5, y: 0.5, active: false }

  let rafId = 0
  let running = false
  let startedAt = 0

  const stashPointer = (clientX: number, clientY: number) => {
    const r = deps.getRect()
    if (!r || r.width === 0 || r.height === 0) return
    pointer.x = (clientX - r.left) / r.width
    pointer.y = (clientY - r.top) / r.height
    pointer.active = true
  }

  const onPointer: FieldListener = (e) => {
    const ev = e as Partial<PointerEvent>
    if (typeof ev.clientX === "number" && typeof ev.clientY === "number") {
      stashPointer(ev.clientX, ev.clientY)
    }
  }
  const onTouch: FieldListener = (e) => {
    const t = (e as Partial<TouchEvent>).touches?.[0]
    if (t) stashPointer(t.clientX, t.clientY)
  }
  const onVisibility = () => {
    if (deps.doc.hidden) {
      // Pause: kill the loop but keep listeners so a return resumes instantly.
      if (rafId) deps.caf(rafId)
      rafId = 0
    } else if (running && rafId === 0) {
      rafId = deps.raf(tick)
    }
  }

  const tick = (t: number) => {
    if (!running) return
    const elapsed = (t - startedAt) / 1000
    for (const p of deps.particles) {
      // Ambient idle drift — always present so an untouched field (90% of mobile
      // loads) still looks alive doing nothing.
      const driftX = Math.sin(elapsed * 0.5 + p.phase) * drift
      const driftY = Math.cos(elapsed * 0.4 + p.phase * 1.3) * drift
      let pullX = 0
      let pullY = 0
      if (pointer.active) {
        const dx = pointer.x - p.base.x
        const dy = pointer.y - p.base.y
        const dist = Math.hypot(dx, dy) || 1
        // Closer particles bend harder toward the pointer; clamps to 0 past ~1
        // container-diagonal away so far particles barely move.
        const strength = Math.max(0, 1 - dist) * pull
        pullX = (dx / dist) * strength
        pullY = (dy / dist) * strength
      }
      p.apply(driftX + pullX, driftY + pullY)
    }
    rafId = deps.raf(tick)
  }

  return {
    start() {
      if (running) return
      running = true
      startedAt = deps.now()
      deps.target.addEventListener("pointermove", onPointer, { passive: true })
      deps.target.addEventListener("touchmove", onTouch, { passive: true })
      deps.doc.addEventListener("visibilitychange", onVisibility)
      rafId = deps.raf(tick)
    },
    stop() {
      running = false
      if (rafId) deps.caf(rafId)
      rafId = 0
      deps.target.removeEventListener("pointermove", onPointer)
      deps.target.removeEventListener("touchmove", onTouch)
      deps.doc.removeEventListener("visibilitychange", onVisibility)
    },
  }
}
