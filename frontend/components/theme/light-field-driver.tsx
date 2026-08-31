"use client"

import { useEffect } from "react"
import {
  MEDIA_QUERY_DESKTOP,
  MEDIA_QUERY_REDUCED_MOTION,
} from "@/mobile/viewport"
import {
  RESTING_CURSOR,
  SUN_TAU_MS,
  castFromPercents,
  cellCenterPercent,
  cssFromPointer,
  followStep,
  parkedCss,
  type SunCss,
} from "@/lib/theme/antipodal-sun"

const VARS = ["--tm-sun-x", "--tm-sun-y", "--tm-cast-x", "--tm-cast-y"] as const
const REST_PTR = cellCenterPercent(RESTING_CURSOR)

function isLight(): boolean {
  return document.documentElement.dataset.surface === "light"
}

function canTrack(): boolean {
  return (
    isLight() &&
    window.matchMedia(MEDIA_QUERY_DESKTOP).matches &&
    !window.matchMedia(MEDIA_QUERY_REDUCED_MOTION).matches
  )
}

function writeCast(css: Pick<SunCss, "castX" | "castY">) {
  const style = document.documentElement.style
  style.setProperty("--tm-cast-x", css.castX)
  style.setProperty("--tm-cast-y", css.castY)
}

function writeSun(x: number, y: number) {
  const style = document.documentElement.style
  style.setProperty("--tm-sun-x", `${x.toFixed(2)}%`)
  style.setProperty("--tm-sun-y", `${y.toFixed(2)}%`)
}

function parkNow() {
  const css = parkedCss()
  writeCast(css)
  document.documentElement.style.setProperty("--tm-sun-x", css.sunX)
  document.documentElement.style.setProperty("--tm-sun-y", css.sunY)
}

function clearInline() {
  const style = document.documentElement.style
  for (const name of VARS) style.removeProperty(name)
}

/**
 * Single writer of the light-surface sun. Math is in antipodal-sun.ts.
 * Dark ignores these vars. Reduced motion and coarse pointers keep the park.
 * The bloom crawls (~8s time constant); it does not track the pointer 1:1.
 */
export function LightFieldDriver() {
  useEffect(() => {
    const root = document.documentElement
    const parked = parkedCss()
    let raf = 0
    let lastT = 0
    let curX = parseFloat(parked.sunX)
    let curY = parseFloat(parked.sunY)
    let tgtX = curX
    let tgtY = curY
    let aimX = REST_PTR.x
    let aimY = REST_PTR.y
    let aimTgtX = aimX
    let aimTgtY = aimY
    let tracking = false

    const stillMoving = () =>
      Math.abs(tgtX - curX) > 0.04 ||
      Math.abs(tgtY - curY) > 0.04 ||
      Math.abs(aimTgtX - aimX) > 0.04 ||
      Math.abs(aimTgtY - aimY) > 0.04

    const tick = (now: number) => {
      raf = 0
      if (!tracking) return
      const dt = lastT ? Math.min(now - lastT, 48) : 16.67
      lastT = now
      curX = followStep(curX, tgtX, dt, SUN_TAU_MS)
      curY = followStep(curY, tgtY, dt, SUN_TAU_MS)
      aimX = followStep(aimX, aimTgtX, dt, SUN_TAU_MS)
      aimY = followStep(aimY, aimTgtY, dt, SUN_TAU_MS)
      writeSun(curX, curY)
      writeCast(castFromPercents(curX, curY, aimX, aimY))
      if (stillMoving()) raf = requestAnimationFrame(tick)
    }

    const onMove = (event: PointerEvent | MouseEvent) => {
      tracking = canTrack()
      if (!tracking) return
      const w = window.innerWidth
      const h = window.innerHeight
      const { css } = cssFromPointer(event.clientX, event.clientY, w, h)
      tgtX = parseFloat(css.sunX)
      tgtY = parseFloat(css.sunY)
      aimTgtX = (event.clientX / Math.max(w, 1)) * 100
      aimTgtY = (event.clientY / Math.max(h, 1)) * 100
      if (!raf) raf = requestAnimationFrame(tick)
    }

    const apply = () => {
      tracking = canTrack()
      lastT = 0
      if (!isLight()) {
        clearInline()
        return
      }
      parkNow()
      const rest = parkedCss()
      curX = parseFloat(rest.sunX)
      curY = parseFloat(rest.sunY)
      tgtX = curX
      tgtY = curY
      aimX = REST_PTR.x
      aimY = REST_PTR.y
      aimTgtX = aimX
      aimTgtY = aimY
    }

    apply()
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("mousemove", onMove, { passive: true })
    const mo = new MutationObserver(apply)
    mo.observe(root, { attributes: true, attributeFilter: ["data-surface"] })

    return () => {
      tracking = false
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("mousemove", onMove)
      mo.disconnect()
      clearInline()
    }
  }, [])

  return null
}
