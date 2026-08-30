"use client"

import { useEffect, useRef, useState, type PointerEvent } from "react"

const THRESH = 96
export const SWIPE_SETTLE = "transform 260ms cubic-bezier(0.32,0.72,0,1)"

/**
 * Horizontal swipe on a job card: left = Skip, right = Save.
 *
 * React's delegated pointermove is passive, so preventDefault cannot stop the
 * scroll parent. Capture the pointer on down, and preventDefault on native
 * touchmove (non-passive) once the axis is locked to X.
 */
export function useCardSwipe({ onSave, onSkip }: { onSave: () => void; onSkip: () => void }) {
  const [leaving, setLeaving] = useState<"" | "right" | "left">("")
  const cardRef = useRef<HTMLDivElement | null>(null)
  const saveRailRef = useRef<HTMLDivElement | null>(null)
  const hideRailRef = useRef<HTMLDivElement | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<"" | "x" | "y">("")
  const dx = useRef(0)
  const suppressClick = useRef(false)

  const paint = (v: number) => {
    const card = cardRef.current
    if (card) card.style.transform = `translateX(${v}px) rotate(${(v * 0.012).toFixed(2)}deg)`
    if (saveRailRef.current) saveRailRef.current.style.opacity = v > 14 ? String(Math.min(v / THRESH, 1)) : "0"
    if (hideRailRef.current) hideRailRef.current.style.opacity = v < -14 ? String(Math.min(-v / THRESH, 1)) : "0"
  }

  const commit = (dir: "right" | "left") => {
    setLeaving(dir)
    window.setTimeout(() => (dir === "right" ? onSave() : onSkip()), 190)
  }

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const onTouchMove = (e: TouchEvent) => {
      if (axis.current === "x") e.preventDefault()
    }
    card.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => card.removeEventListener("touchmove", onTouchMove)
  }, [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (leaving) return
    if ((e.target as HTMLElement).closest("button, a")) return
    start.current = { x: e.clientX, y: e.clientY }
    axis.current = ""
    dx.current = 0
    suppressClick.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    const card = cardRef.current
    if (card) {
      card.style.transition = "none"
      card.style.willChange = "transform"
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current || leaving) return
    const ddx = e.clientX - start.current.x
    const ddy = e.clientY - start.current.y
    if (!axis.current) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? "x" : "y"
      if (axis.current === "x") {
        suppressClick.current = true
        const card = cardRef.current
        if (card) card.style.touchAction = "none"
      }
    }
    if (axis.current === "x") {
      dx.current = ddx
      paint(ddx)
    }
  }

  const settle = () => {
    const card = cardRef.current
    if (card) {
      card.style.transition = SWIPE_SETTLE
      card.style.touchAction = "pan-y"
      const drop = () => { card.style.willChange = "auto"; card.removeEventListener("transitionend", drop) }
      card.addEventListener("transitionend", drop)
    }
    dx.current = 0
    paint(0)
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (axis.current === "x") {
      if (dx.current >= THRESH) {
        axis.current = ""
        start.current = null
        commit("right")
        return
      }
      if (dx.current <= -THRESH) {
        axis.current = ""
        start.current = null
        commit("left")
        return
      }
    }
    settle()
    axis.current = ""
    start.current = null
  }

  return {
    cardRef,
    saveRailRef,
    hideRailRef,
    leaving,
    suppressClick,
    commit,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
