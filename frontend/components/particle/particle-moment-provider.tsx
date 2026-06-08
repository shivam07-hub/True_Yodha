"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useViewport } from "@/mobile"
import { ParticleMoment } from "./particle-moment"

/* Provider + imperative hook for firing one-shot particle "WOW" moments.

   Mount <ParticleMomentProvider> once (authed layout). Anywhere below it:

     const fire = useParticleMoment()
     fire()                                          // centre burst
     fire({ anchor: { x, y }, intensity: 1.5 })      // from a card, bigger

   Gating is centralised here so callers never worry about it:
     - desktop only (no cursor field metaphor on touch; perf headroom)
     - prefers-reduced-motion → no-op
     - one moment at a time (re-fire while active is ignored)
   On any non-desktop / reduced-motion client, fire() is a safe no-op. */

export type ParticleMomentOptions = {
  anchor?: { x: number; y: number }
  durationMs?: number
  intensity?: number
}

type FireFn = (opts?: ParticleMomentOptions) => void

const ParticleMomentContext = createContext<FireFn>(() => {})

export function useParticleMoment(): FireFn {
  return useContext(ParticleMomentContext)
}

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

export function ParticleMomentProvider({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useViewport()
  const reducedMotion = usePrefersReducedMotion()
  const allowed = isDesktop && !reducedMotion

  const [active, setActive] = useState<{ key: number; opts: ParticleMomentOptions } | null>(null)
  const keyRef = useRef(0)
  const allowedRef = useRef(allowed)
  allowedRef.current = allowed

  const fire = useCallback<FireFn>((opts) => {
    if (!allowedRef.current) return
    // One moment at a time — ignore re-fires while one is playing.
    setActive((prev) => (prev ? prev : { key: ++keyRef.current, opts: opts ?? {} }))
  }, [])

  const handleDone = useCallback(() => setActive(null), [])

  return (
    <ParticleMomentContext.Provider value={fire}>
      {children}
      {allowed && active && (
        <ParticleMoment
          key={active.key}
          anchor={active.opts.anchor}
          durationMs={active.opts.durationMs}
          intensity={active.opts.intensity}
          onDone={handleDone}
        />
      )}
    </ParticleMomentContext.Provider>
  )
}
