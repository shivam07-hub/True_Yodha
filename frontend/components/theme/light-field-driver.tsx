"use client"

import { useEffect } from "react"
import {
  MEDIA_QUERY_DESKTOP,
  MEDIA_QUERY_REDUCED_MOTION,
} from "@/mobile/viewport"
import {
  cssFromPointer,
  parkedCss,
  type SunCss,
} from "@/lib/theme/antipodal-sun"

const LERP = 0.16
const VARS = ["--tm-sun-x", "--tm-sun-y", "--tm-cast-x", "--tm-cast-y"] as const

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

function writeCast(css: SunCss) {
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
 * Tracking is read live from matchMedia so a docked mouse starts without remount.
 */
export function LightFieldDriver() {
  useEffect(() => {
    const root = document.documentElement
    const parked = parkedCss()
    let raf = 0
    let curX = parseFloat(parked.sunX)
    let curY = parseFloat(parked.sunY)
    let tgtX = curX
    let tgtY = curY
    let lastCursorKey = ""
    let tracking = false

    const tick = () => {
      raf = 0
      if (!tracking) return
      curX += (tgtX - curX) * LERP
      curY += (tgtY - curY) * LERP
      writeSun(curX, curY)
      if (Math.abs(tgtX - curX) > 0.04 || Math.abs(tgtY - curY) > 0.04) {
        raf = requestAnimationFrame(tick)
      }
    }

    const onMove = (event: PointerEvent | MouseEvent) => {
      tracking = canTrack()
      if (!tracking) return
      const { cursor, sun, css } = cssFromPointer(
        event.clientX,
        event.clientY,
        window.innerWidth,
        window.innerHeight,
      )
      tgtX = parseFloat(css.sunX)
      tgtY = parseFloat(css.sunY)
      const key = `${cursor.x},${cursor.y}:${sun.x},${sun.y}`
      if (key !== lastCursorKey) {
        lastCursorKey = key
        writeCast(css)
      }
      if (!raf) raf = requestAnimationFrame(tick)
    }

    const apply = () => {
      tracking = canTrack()
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
      lastCursorKey = ""
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
