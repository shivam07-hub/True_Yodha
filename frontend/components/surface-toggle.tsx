"use client"

import { useEffect, useState } from "react"

type Variation = "signal" | "forge"

const ACCENT_STORAGE_KEY = "tm.accent"
const SURFACE_STORAGE_KEY = "tm.surface"
const DEFAULT_VARIATION: Variation = "signal"

export function SurfaceToggle() {
  const [variation, setVariation] = useState<Variation>(DEFAULT_VARIATION)

  useEffect(() => {
    const storedAccent = (typeof window !== "undefined"
      ? (localStorage.getItem(ACCENT_STORAGE_KEY) as Variation | null)
      : null)
    const storedSurface = (typeof window !== "undefined"
      ? localStorage.getItem(SURFACE_STORAGE_KEY)
      : null)

    const next: Variation =
      storedAccent === "signal" || storedAccent === "forge"
        ? storedAccent
        : storedSurface === "light"
          ? "forge"
          : DEFAULT_VARIATION

    applyVariation(next)
    setVariation(next)
  }, [])

  function applyVariation(next: Variation) {
    const nextSurface = next === "forge" ? "light" : "dark"
    document.documentElement.setAttribute("data-accent", next)
    document.documentElement.setAttribute("data-surface", nextSurface)
    localStorage.setItem(ACCENT_STORAGE_KEY, next)
    localStorage.setItem(SURFACE_STORAGE_KEY, nextSurface)
  }

  function choose(next: Variation) {
    setVariation(next)
    applyVariation(next)
  }

  return (
    <div
      className="tm-segment-toggle"
      role="group"
      aria-label="Background variation"
    >
      <button
        type="button"
        aria-pressed={variation === "signal"}
        onClick={() => choose("signal")}
      >
        Signal
      </button>
      <button
        type="button"
        aria-pressed={variation === "forge"}
        onClick={() => choose("forge")}
      >
        Forge
      </button>
    </div>
  )
}
