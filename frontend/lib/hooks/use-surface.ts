/**
 * Owns the surface (light/dark) theme contract shared with the
 * `beforeInteractive` init script in app/layout.tsx. The `myro-surface`
 * localStorage key is the single source of truth:
 *   "light" | "dark"  → explicit user override
 *   absent / invalid   → follow the OS (`prefers-color-scheme`)
 *
 * The hook surfaces a 3-state preference (system/light/dark) for UI, resolves
 * it to the concrete surface applied to <html data-surface>, and — while on
 * "system" — live-tracks OS theme flips. Writing a preference applies it
 * immediately (no reload), matching the no-flicker guarantee of the init
 * script on next load.
 */
"use client"

import { useCallback, useEffect, useState } from "react"

export type SurfacePref = "system" | "light" | "dark"
export type ResolvedSurface = "light" | "dark"

const KEY = "myro-surface"

function systemSurface(): ResolvedSurface {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function readPref(): SurfacePref {
  try {
    const s = localStorage.getItem(KEY)
    return s === "light" || s === "dark" ? s : "system"
  } catch {
    return "system"
  }
}

function applyResolved(pref: SurfacePref) {
  const resolved = pref === "system" ? systemSurface() : pref
  document.documentElement.dataset.surface = resolved
}

export function useSurface() {
  // SSR ships "system"; the effect reconciles to the real persisted value
  // after mount, so first client render matches the server tree.
  const [pref, setPrefState] = useState<SurfacePref>("system")
  const [resolved, setResolved] = useState<ResolvedSurface>("light")

  useEffect(() => {
    const initial = readPref()
    setPrefState(initial)
    setResolved(initial === "system" ? systemSurface() : initial)
  }, [])

  // While following the OS, re-resolve on theme flips.
  useEffect(() => {
    if (pref !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const next = systemSurface()
      setResolved(next)
      document.documentElement.dataset.surface = next
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [pref])

  const setPref = useCallback((next: SurfacePref) => {
    try {
      if (next === "system") localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      /* storage blocked — apply in-memory for this session anyway */
    }
    setPrefState(next)
    setResolved(next === "system" ? systemSurface() : next)
    applyResolved(next)
  }, [])

  return { pref, resolved, setPref }
}
