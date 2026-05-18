"use client"

import { useEffect, useState } from "react"
import { useViewport } from "@/mobile"

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
  const { reducedMotion: reduceMotion } = useViewport()

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
