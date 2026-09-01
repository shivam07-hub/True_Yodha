"use client"

import { useEffect } from "react"
import { useAuth } from "@/lib/hooks/use-auth"
import { clearPendingPrepIntent } from "@/lib/prep-intent-stash"
import { PrepList } from "@/components/preparations/prep-list"
import { PrepSkeleton } from "@/components/preparations/prep-skeleton"
import "@/components/preparations/preparations.css"

/**
 * /preparations — the post-apply surface (grill-locked 2026-07-15, memory
 * project_preparations_surface). Successor of the retired /cv?view=active
 * "Applications" tab: every applied job gets a prep room; the list is the
 * stage-grouped pipeline. Desktop chrome matches Jobs / Collections
 * (1480 shell + 2:3 standing column); the room stays an 860px reading column.
 */
export default function PreparationsPage() {
  const { token, ready } = useAuth()
  // The newsletter lane (Exception 3) routed the reader here once. Drop the
  // marker so a later login goes to their normal surface instead of pinning
  // them to Preparation forever.
  useEffect(() => { clearPendingPrepIntent() }, [])
  if (!ready) return <PrepSkeleton />
  return <PrepList token={token ?? ""} />
}
