"use client"

import { useEffect, useState } from "react"

// Returns true only on desktop: min-width 769px AND fine pointer (mouse).
// Defaults false (mobile-safe) so SSR and first paint never show desktop-only extras.
export function useIsDesktop(): boolean {
  const [is, setIs] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px) and (pointer: fine)")
    setIs(mq.matches)
    const h = (e: MediaQueryListEvent) => setIs(e.matches)
    mq.addEventListener("change", h)
    return () => mq.removeEventListener("change", h)
  }, [])
  return is
}
