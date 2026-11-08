/**
 * Autosave for the CV that is open when that CV is a job document.
 *
 * Same debounce and refresh recovery as the Main CV autosave. The write goes
 * through `save`, which the playground binds to this job's draft. It never
 * calls the master save.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CVStructured } from "@/lib/api"
import {
  cvStructuredEqual,
  parsePersistedDraft,
  pickInitialDraft,
  type SaveStatus,
} from "@/lib/cv-autosave"
import { writeOpenDocument } from "@/lib/cv/open-document"

const DEBOUNCE_MS = 1_200

interface Args {
  enabled: boolean
  seed: CVStructured
  draftKey: string
  save: (cv: CVStructured) => Promise<void>
}

export interface JobDraftAutosaveState {
  draft: CVStructured | null
  status: SaveStatus
  update: (next: CVStructured) => void
  saveNow: () => Promise<void>
}

function refuseMasterWrite(): Promise<never> {
  return Promise.reject(new Error("A tailored CV is not the Main CV."))
}

export function useJobDraftAutosave({ enabled, seed, draftKey, save }: Args): JobDraftAutosaveState {
  const [draft, setDraft] = useState<CVStructured | null>(null)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<CVStructured | null>(null)
  const serverRef = useRef<CVStructured | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!enabled || draft != null) return
    const persisted = typeof window !== "undefined"
      ? parsePersistedDraft(window.sessionStorage.getItem(draftKey))
      : null
    const initial = pickInitialDraft(seed, persisted)
    serverRef.current = seed
    latestRef.current = initial
    setDraft(initial)
  }, [draft, draftKey, enabled, seed])

  const flush = useCallback(async () => {
    const next = latestRef.current
    if (!enabled || !next) return
    if (cvStructuredEqual(serverRef.current, next)) {
      setStatus("saved")
      return
    }
    setStatus("saving")
    try {
      await writeOpenDocument("job", next, {
        saveMaster: refuseMasterWrite,
        saveJob: (cv) => saveRef.current(cv),
      })
      serverRef.current = next
      try { window.sessionStorage.removeItem(draftKey) } catch { /* private mode */ }
      setStatus("saved")
    } catch {
      setStatus("error")
    }
  }, [draftKey, enabled])

  const update = useCallback((next: CVStructured) => {
    latestRef.current = next
    setDraft(next)
    try { window.sessionStorage.setItem(draftKey, JSON.stringify(next)) } catch { /* private mode */ }
    setStatus("saving")
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void flush() }, DEBOUNCE_MS)
  }, [draftKey, flush])

  const saveNow = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    return flush()
  }, [flush])

  useEffect(() => {
    const onHide = () => {
      const next = latestRef.current
      if (!next) return
      try { window.sessionStorage.setItem(draftKey, JSON.stringify(next)) } catch { /* ignore */ }
    }
    window.addEventListener("beforeunload", onHide)
    return () => {
      window.removeEventListener("beforeunload", onHide)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draftKey])

  return { draft, status, update, saveNow }
}
