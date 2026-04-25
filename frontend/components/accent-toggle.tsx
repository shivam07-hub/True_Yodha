/**
 * Myro — Accent toggle component
 * ──────────────────────────────────────────────────────────────────
 * Drop this anywhere (recommended: sidebar footer).
 * Writes data-accent="signal" | "forge" on <html> and persists to
 * localStorage under "tm.accent". The rest of the app reacts through
 * CSS variables — no prop drilling, no context needed.
 *
 * To prevent a flash of wrong accent on first paint, also add the
 * inline bootstrap script in app/layout.tsx (see branding/README.md).
 */

"use client"

import { useEffect, useState } from "react"

type Accent = "signal" | "forge"

const STORAGE_KEY = "tm.accent"
const DEFAULT_ACCENT: Accent = "signal"

export function AccentToggle() {
  const [accent, setAccent] = useState<Accent>(DEFAULT_ACCENT)

  useEffect(() => {
    const stored = (typeof window !== "undefined"
      ? (localStorage.getItem(STORAGE_KEY) as Accent | null)
      : null)
    const next = stored === "signal" || stored === "forge" ? stored : DEFAULT_ACCENT
    applyAccent(next)
    setAccent(next)
  }, [])

  function applyAccent(next: Accent) {
    document.documentElement.setAttribute("data-accent", next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  function choose(next: Accent) {
    setAccent(next)
    applyAccent(next)
  }

  return (
    <div
      className="tm-segment-toggle"
      role="group"
      aria-label="Accent color"
    >
      <button
        type="button"
        aria-pressed={accent === "signal"}
        onClick={() => choose("signal")}
      >
        Signal
      </button>
      <button
        type="button"
        aria-pressed={accent === "forge"}
        onClick={() => choose("forge")}
      >
        Forge
      </button>
    </div>
  )
}
