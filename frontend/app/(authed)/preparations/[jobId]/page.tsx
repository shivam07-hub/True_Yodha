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
 * one surface, so this route only chooses which room the main column holds.
 */
export default function PreparationRoomPage({ params }: { params: { jobId: string } }) {
  const { token, ready } = useAuth()
  if (!ready) return <PrepSkeleton />
  return <PrepShell token={token ?? ""} jobId={decodeURIComponent(params.jobId)} />
}
