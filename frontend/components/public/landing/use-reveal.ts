"use client"

import { useEffect, type RefObject } from "react"

/**
 * Reveal-on-scroll for `.lp-reveal` descendants (design handoff §Interactions).
 *
 * MUST fail open: if the IntersectionObserver never fires within 1s
 * (offscreen iframes, print, DOM captures, frozen timelines), apply the
 * end-state instantly with transitions disabled rather than leaving
 * sections at opacity 0. This bug class was found during design QA —
 * keep the failsafe.
 */
export function useReveal(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const els = Array.from(root.querySelectorAll<HTMLElement>(".lp-reveal"))
    if (els.length === 0) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!("IntersectionObserver" in window) || reduceMotion) {
      els.forEach((el) => el.classList.add("is-in"))
      return
    }

    let ioFired = false
    const io = new IntersectionObserver(
      (entries) => {
        ioFired = true
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in")
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    )
    els.forEach((el) => io.observe(el))

    const failOpen = window.setTimeout(() => {
      if (!ioFired) {
        els.forEach((el) => {
          el.style.transition = "none"
          el.classList.add("is-in")
        })
      }
    }, 1000)

    return () => {
      io.disconnect()
      window.clearTimeout(failOpen)
    }
  }, [rootRef])
}
