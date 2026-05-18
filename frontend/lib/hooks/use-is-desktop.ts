"use client"

import { useEffect, useState } from "react"
import { MEDIA_QUERY_DESKTOP } from "@/lib/viewport"

// Returns true only on desktop: see lib/viewport.ts for breakpoint definition.
// Defaults false (mobile-safe) so SSR and first paint never show desktop-only extras.
export function useIsDesktop(): boolean {
  const [is, setIs] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(MEDIA_QUERY_DESKTOP)
    setIs(mq.matches)
    const h = (e: MediaQueryListEvent) => setIs(e.matches)
    mq.addEventListener("change", h)
    return () => mq.removeEventListener("change", h)
  }, [])
  return is
}
