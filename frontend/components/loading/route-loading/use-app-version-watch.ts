"use client"

import { useEffect } from "react"

const STATUS_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ""}/v1/status`
const FIVE_MIN = 5 * 60 * 1000

export function useAppVersionWatch(onMismatch: () => void): void {
  useEffect(() => {
    const metaEl = document.querySelector('meta[name="app-version"]')
    const initialVersion = metaEl?.getAttribute("content")

    // ChunkLoadError → hard reload (chunk version drift after deploy)
    const onError = (e: ErrorEvent) => {
      if (e.message?.includes("ChunkLoadError") || e.message?.includes("Loading chunk")) {
        window.location.reload()
      }
    }
    window.addEventListener("error", onError)

    if (!initialVersion) return () => window.removeEventListener("error", onError)

    let hiddenAt: number | null = null

    const onVisibility = async () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt === null || Date.now() - hiddenAt <= FIVE_MIN) return
      hiddenAt = null

      try {
        const res = await fetch(STATUS_URL)
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        if (data?.version && data.version !== initialVersion) onMismatch()
      } catch {}
    }

    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("error", onError)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [onMismatch])
}
