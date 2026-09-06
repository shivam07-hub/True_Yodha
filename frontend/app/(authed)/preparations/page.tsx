"use client"

import { useEffect } from "react"
import { useAuth } from "@/lib/hooks/use-auth"
import { clearPendingPrepIntent } from "@/lib/prep-intent-stash"
import { PrepShell } from "@/components/preparations/prep-shell"
import { PrepSkeleton } from "@/components/preparations/prep-skeleton"
import "@/components/preparations/preparations.css"
import "@/app/(authed)/practice/practice.css"

/**
 * /preparations — the post-apply surface (grill-locked 2026-07-15, memory
 * project_preparations_surface), rebuilt as Unified Prep v2 artboard 2b: the
 * rail lists every room with its four pips, the main column is the room that
 * most wants attention. There is no separate list view any more — a
 * stage-grouped index was a second place to read the state the pips carry.
 * practice.css is imported for the inline skill drill (the up-* quiz kit).
 */
export default function PreparationsPage() {
  const { token, ready } = useAuth()
  // The newsletter lane (Exception 3) routed the reader here once. Drop the
  // marker so a later login goes to their normal surface instead of pinning
  // them to Preparation forever.
  useEffect(() => { clearPendingPrepIntent() }, [])
  if (!ready) return <PrepSkeleton />
  return <PrepShell token={token ?? ""} />
}
