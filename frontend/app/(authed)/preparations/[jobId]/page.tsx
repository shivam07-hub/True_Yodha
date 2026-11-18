"use client"

import { useAuth } from "@/lib/hooks/use-auth"
import { PrepShell } from "@/components/preparations/prep-shell"
import { PrepSkeleton } from "@/components/preparations/prep-skeleton"
import "@/components/preparations/preparations.css"
import "@/app/(authed)/practice/practice.css"

/**
 * /preparations/[jobId] — the same screen as /preparations with this room open.
 * Deep-linkable by design (grill Q4/Q8): Collections rows, the loop bar and
 * notifications all land here. Unified Prep v2 (2b) made the list and the room
 * one surface; the shell reads the room and `?step=N` off the URL itself, so
 * this route exists only so a deep link resolves.
 */
export default function PreparationRoomPage() {
  const { token, ready } = useAuth()
  if (!ready) return <PrepSkeleton />
  return <PrepShell token={token ?? ""} />
}
