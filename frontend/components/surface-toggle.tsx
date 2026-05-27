"use client"

import { useEffect, useState } from "react"

type Variation = "signal" | "forge"

const ACCENT_STORAGE_KEY = "tm.accent"
const SURFACE_STORAGE_KEY = "tm.surface"
const DEFAULT_VARIATION: Variation = "forge"

// Ghost = dark/teal mode
function GhostIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4C8.69 4 6 6.69 6 10v9l2.5-2 2 2 2-2 2 2 2-2V10c0-3.31-2.69-6-6-6z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <circle cx="10" cy="11" r="1.2" fill="currentColor" />
      <circle cx="14" cy="11" r="1.2" fill="currentColor" />
    </svg>
  )
}

// Spirit = white/light mode
function SpiritIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3c-1.5 2.5-3 5-3 7.5a3 3 0 006 0C15 8 13.5 5.5 12 3z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <path d="M12 15v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

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
      aria-label="Appearance"
    >
      {/* Ghost = dark / teal */}
      <button
        type="button"
        aria-pressed={variation === "signal"}
        aria-label="Ghost — dark mode"
        title="Ghost"
        onClick={() => choose("signal")}
        style={{ padding: "0.375rem 0.75rem", display: "flex", alignItems: "center", gap: 5 }}
      >
        <GhostIcon />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Ghost</span>
      </button>
      {/* Spirit = white / light */}
      <button
        type="button"
        aria-pressed={variation === "forge"}
        aria-label="Spirit — light mode"
        title="Spirit"
        onClick={() => choose("forge")}
        style={{ padding: "0.375rem 0.75rem", display: "flex", alignItems: "center", gap: 5 }}
      >
        <SpiritIcon />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Spirit</span>
      </button>
    </div>
  )
}
