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
      {/* Signal = dark = moon */}
      <button
        type="button"
        aria-pressed={variation === "signal"}
        aria-label="Dark (Signal)"
        title="Dark"
        onClick={() => choose("signal")}
        style={{ padding: "0.375rem 0.625rem", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {/* Forge = light = sun */}
      <button
        type="button"
        aria-pressed={variation === "forge"}
        aria-label="Light (Forge)"
        title="Light"
        onClick={() => choose("forge")}
        style={{ padding: "0.375rem 0.625rem", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
          <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
