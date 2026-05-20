"use client"

import { useEffect, useState } from "react"
import type { FeedbackContext } from "./feedback-types"

export function useContextSnapshot(): FeedbackContext | null {
  const [ctx, setCtx] = useState<FeedbackContext | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    setCtx({
      url: window.location.pathname + window.location.search,
      user_agent: navigator.userAgent,
      viewport: `${window.innerWidth} × ${window.innerHeight}`,
      accent: typeof document !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--tm-accent").trim() || null
        : null,
    })
  }, [])

  return ctx
}
