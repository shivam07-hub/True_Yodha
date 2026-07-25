/**
 * useDismissedFixes — per-surface "not applicable" state for fix cards.
 *
 * The recruiter checks are deterministic heuristics, so a card can be wrong for
 * THIS user's line (a bullet with genuinely no number to add). Dismiss hides the
 * card — it does NOT return the card's points: the content penalty stays in
 * Ready, so the score can't be inflated by dismissing everything. Dismissed
 * cards sit in a collapsed rail group with one-tap Restore.
 *
 * Scope = one storage bucket per surface ("job:{id}" / "master"), persisted in
 * localStorage so a nag stays dismissed across reloads. Fix ids are stable
 * (category + bullet ref / skill key), and only ids that still match an OPEN
 * fix render — stale ids are inert and pruned on the next dismissal write.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const STORE_KEY = "myro_cv_fix_dismissed_v1"

function storageKey(scope: string): string {
  return `${STORE_KEY}:${scope}`
}

function readStore(scope: string): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.sessionStorage.getItem(storageKey(scope))
    const ids = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [])
  } catch {
    return new Set()
  }
}

function writeStore(scope: string, ids: Set<string>): void {
  try {
    if (ids.size === 0) window.sessionStorage.removeItem(storageKey(scope))
    else window.sessionStorage.setItem(storageKey(scope), JSON.stringify(Array.from(ids)))
  } catch {
    // storage unavailable (private mode / quota) — dismissal still holds for the session
  }
}

export function useDismissedFixes(scope: string) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readStore(scope))

  // A view instance can be re-pointed at another job without remounting —
  // reload that job's bucket instead of carrying the previous one over.
  const scopeRef = useRef(scope)
  useEffect(() => {
    if (scopeRef.current === scope) return
    scopeRef.current = scope
    setDismissed(readStore(scope))
  }, [scope])

  const dismiss = useCallback((id: string, openIds?: Set<string>) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      // Prune ids that no longer match any open fix (text changed / fix cleared)
      // so the bucket can't grow without bound.
      if (openIds) Array.from(next).forEach(stored => {
        if (stored !== id && !openIds.has(stored)) next.delete(stored)
      })
      writeStore(scope, next)
      return next
    })
  }, [scope])

  const restore = useCallback((id: string) => {
    setDismissed(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      writeStore(scope, next)
      return next
    })
  }, [scope])

  return { dismissed, dismiss, restore }
}
