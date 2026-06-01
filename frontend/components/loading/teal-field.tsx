"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createFieldMotion, shouldAnimateField, type FieldParticle } from "./field-motion"

/**
 * <TealField> — the ambient, cursor/touch-reactive teal-edge loading playground
 * (dashboard-loading grill Q6–Q10). It replaces the static grey shimmer as the
 * "fill" behind a loading region: an inset teal rim plus a handful of faint
 * particles that drift on their own and bend toward the pointer/finger. There is
 * no goal, score, or win-state — it is lively to look at and harmless to abandon
 * the instant content is ready.
 *
 * Two modes (one primitive, drift-proof — grill Q10):
 *  - "full-bleed" → fixed, viewport-filling, optional centred message. The OAuth
 *    callback preset; exported as `EdgeGlow` so that call site never churns.
 *  - "masked" → a backdrop layer that fills its parent region and sits BEHIND
 *    `children` (the real-shape skeleton card). The field recedes per section as
 *    each query resolves and its card crossfades to real content (grill Q7).
 *
 * Perf/a11y contract (grill Q9, enforced via field-motion.ts):
 *  - transform/opacity only; pointer input coalesced into one rAF tick/frame.
 *  - mounts only while a section loads; unmounting (section ready) hard-tears-down
 *    every listener + the rAF — no idle battery cost after paint.
 *  - paused on tab blur; ~10 particles, DOM not canvas.
 *  - prefers-reduced-motion → static teal rim only, no particles, no reactivity.
 */

type TealFieldMode = "full-bleed" | "masked"

/** Fixed, low particle count (grill Q9 cap ~8–12); deterministic so SSR matches. */
const PARTICLES = [
  { x: 0.12, y: 0.22, phase: 0.0, size: 3 },
  { x: 0.31, y: 0.68, phase: 1.1, size: 2 },
  { x: 0.48, y: 0.18, phase: 2.3, size: 4 },
  { x: 0.62, y: 0.74, phase: 0.7, size: 2 },
  { x: 0.79, y: 0.34, phase: 3.0, size: 3 },
  { x: 0.88, y: 0.62, phase: 1.8, size: 2 },
  { x: 0.21, y: 0.46, phase: 2.7, size: 3 },
  { x: 0.55, y: 0.5, phase: 0.4, size: 2 },
  { x: 0.7, y: 0.14, phase: 1.5, size: 3 },
  { x: 0.4, y: 0.86, phase: 2.0, size: 2 },
] as const

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const handler = () => setReduced(mq.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return reduced
}

export function TealField({
  mode = "masked",
  interactive = true,
  message,
  className,
  style,
  children,
}: {
  mode?: TealFieldMode
  interactive?: boolean
  /** full-bleed only: centred status line (e.g. the OAuth message). */
  message?: string
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([])
  const reducedMotion = usePrefersReducedMotion()
  const animate = shouldAnimateField(interactive, reducedMotion)

  useEffect(() => {
    if (!animate) return
    const container = fieldRef.current
    if (!container) return

    const particles: FieldParticle[] = PARTICLES.map((p, i) => ({
      base: { x: p.x, y: p.y },
      phase: p.phase,
      apply: (tx, ty) => {
        const el = dotRefs.current[i]
        if (el) el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
      },
    }))

    const motion = createFieldMotion({
      particles,
      getRect: () => {
        const r = container.getBoundingClientRect()
        return { left: r.left, top: r.top, width: r.width, height: r.height }
      },
      target: window,
      doc: document,
      raf: (cb) => requestAnimationFrame(cb),
      caf: (id) => cancelAnimationFrame(id),
      now: () => performance.now(),
    })
    motion.start()
    return () => motion.stop()
  }, [animate])

  const rim = (
    <span
      aria-hidden="true"
      className={animate ? undefined : "tm-field-rim-static"}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        borderRadius: "inherit",
        boxShadow:
          "inset 0 0 120px 6px var(--tm-int-bg-wash), inset 0 0 3px 1px var(--tm-int-border)",
        ...(animate ? null : { animation: "tm-edge-pulse 2400ms ease-in-out infinite" }),
      }}
    />
  )

  const dots = animate && (
    <span aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          ref={(el) => {
            dotRefs.current[i] = el
          }}
          style={{
            position: "absolute",
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "var(--tm-int-border)",
            boxShadow: "0 0 6px 1px var(--tm-interactive-glow)",
            opacity: 0.5,
            willChange: "transform",
          }}
        />
      ))}
    </span>
  )

  // Shared keyframes for the reduced-motion static rim pulse (reuses the OAuth
  // motif name; the media query below stills it entirely under reduce).
  const keyframes = (
    <style>{`
      @keyframes tm-edge-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
      @keyframes tm-edge-text { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }
      @media (prefers-reduced-motion: reduce) {
        .tm-field-rim-static { animation: none !important; opacity: 0.7; }
        [style*="tm-edge-text"] { animation: none !important; }
      }
    `}</style>
  )

  if (mode === "full-bleed") {
    return (
      <main
        ref={fieldRef}
        className={className}
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--tm-bg)",
          color: "var(--tm-text-muted)",
          fontSize: 13,
          letterSpacing: "0.04em",
          fontFamily: "var(--tm-font-sans, var(--font-sans), sans-serif)",
          ...style,
        }}
      >
        {rim}
        {dots}
        {message && (
          <span
            style={{
              position: "relative",
              animation: animate ? undefined : "tm-edge-text 2400ms ease-in-out infinite",
            }}
          >
            {message}
          </span>
        )}
        {keyframes}
      </main>
    )
  }

  // masked: backdrop field behind the real-shape skeleton card (children).
  return (
    <div
      ref={fieldRef}
      className={className}
      style={{ position: "relative", borderRadius: 16, ...style }}
    >
      {rim}
      {dots}
      <div style={{ position: "relative" }}>{children}</div>
      {keyframes}
    </div>
  )
}

/**
 * Full-bleed preset of <TealField> — the "destination not yet known" loader
 * (OAuth callback). Kept as a named export so existing call sites don't churn
 * (grill Q10).
 */
export function EdgeGlow({ message = "Signing you in…" }: { message?: string }) {
  return <TealField mode="full-bleed" message={message} />
}
