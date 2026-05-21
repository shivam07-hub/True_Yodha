"use client"

import { useEffect, useState } from "react"
import type { RefObject } from "react"
import { useViewport } from "@/mobile"

export function useAllowLoopingMotion(hostRef: RefObject<Element>): boolean {
  const [isInView, setIsInView] = useState(true)
  const { reducedMotion } = useViewport()

  useEffect(() => {
    if (typeof window === "undefined") return
    if (typeof IntersectionObserver === "undefined") return
    const host = hostRef.current
    if (!host) return

    const observer = new IntersectionObserver(
      (entries) => setIsInView(entries[0]?.isIntersecting ?? true),
      { threshold: 0.15 },
    )
    observer.observe(host)
    return () => observer.disconnect()
  }, [hostRef])

  return isInView && !reducedMotion
}
