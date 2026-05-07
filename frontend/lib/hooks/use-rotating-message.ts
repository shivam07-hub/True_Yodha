"use client"

import { useEffect, useState } from "react"

interface UseRotatingMessageOptions {
  enabled?: boolean
  intervalMs?: number
}

export function useRotatingMessage(
  messages: readonly string[],
  options: UseRotatingMessageOptions = {},
) {
  const { enabled = true, intervalMs = 1700 } = options
  const [index, setIndex] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduceMotion(mediaQuery.matches)
    sync()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync)
      return () => mediaQuery.removeEventListener("change", sync)
    }

    mediaQuery.addListener(sync)
    return () => mediaQuery.removeListener(sync)
  }, [])

  useEffect(() => {
    setIndex(0)
  }, [enabled, messages])

  useEffect(() => {
    if (!enabled || reduceMotion || messages.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((value) => (value + 1) % messages.length)
    }, intervalMs)

    return () => window.clearInterval(id)
  }, [enabled, intervalMs, messages.length, reduceMotion])

  return messages[index] ?? ""
}
