"use client"

import { useEffect, useState } from "react"

type Surface = "dark" | "light"

const STORAGE_KEY = "tm.surface"
const DEFAULT_SURFACE: Surface = "dark"

export function SurfaceToggle() {
  const [surface, setSurface] = useState<Surface>(DEFAULT_SURFACE)

  useEffect(() => {
    const stored = (typeof window !== "undefined"
      ? (localStorage.getItem(STORAGE_KEY) as Surface | null)
      : null)
    const next = stored === "light" || stored === "dark" ? stored : DEFAULT_SURFACE
    applySurface(next)
    setSurface(next)
  }, [])

  function applySurface(next: Surface) {
    document.documentElement.setAttribute("data-surface", next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  function choose(next: Surface) {
    setSurface(next)
    applySurface(next)
  }

  return (
    <div
      className="tm-segment-toggle"
      role="group"
      aria-label="Background theme"
    >
      <button
        type="button"
        aria-pressed={surface === "dark"}
        onClick={() => choose("dark")}
      >
        Dark
      </button>
      <button
        type="button"
        aria-pressed={surface === "light"}
        onClick={() => choose("light")}
      >
        White
      </button>
    </div>
  )
}
