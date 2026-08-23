/**
 * Owns the Signal/Bone accent preference contract shared with the
 * `beforeInteractive` init script in app/layout.tsx. Mirrors use-surface.ts's
 * shape exactly (backlog ND15) — `myro-accent` in localStorage is the
 * per-device instant-paint cache; `user_profiles.accent_pref` (synced via
 * reconcileAccentFromServer, called once from useShellModel when the profile
 * loads) is the durable, cross-device source of truth.
 *
 * Default = Signal (azure) — zero visual change for every existing user until
 * they opt into Bone themselves. The stored key stays `"forge"`: it is an
 * identifier, not copy, and has outlived two renames (Forge → Ember → Bone).
 * Anyone already on `"forge"` moves from amber to Bone without acting, which
 * is deliberate: amber sat 5° from --tm-warning and had to go either way.
 */
"use client"

import { useCallback, useEffect, useState } from "react"

export type Accent = "signal" | "forge"

const KEY = "myro-accent"
const DEFAULT_ACCENT: Accent = "signal"

function readLocal(): Accent {
  try {
    const v = localStorage.getItem(KEY)
    return v === "signal" || v === "forge" ? v : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

function applyLocal(next: Accent) {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* storage blocked — apply in-memory for this session anyway */
  }
  document.documentElement.dataset.accent = next
}

/** One-way sync: server value wins once fetched, unless it already matches
 *  what's applied (avoids clobbering a same-session toggle mid-flight). */
export function reconcileAccentFromServer(serverPref: Accent) {
  if (typeof window === "undefined") return
  if (readLocal() === serverPref) return
  applyLocal(serverPref)
}

export function useAccent() {
  const [pref, setPrefState] = useState<Accent>(DEFAULT_ACCENT)

  useEffect(() => {
    setPrefState(readLocal())
  }, [])

  const setPref = useCallback((next: Accent) => {
    applyLocal(next)
    setPrefState(next)
  }, [])

  return { pref, setPref }
}
