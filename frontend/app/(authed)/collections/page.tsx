"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/hooks/use-auth"
import { useViewport } from "@/mobile"
import { CollectionsSurface } from "@/mobile/redesign/collections-surface"
import { CollectionsDesktop } from "@/components/collections/collections-desktop"
import { usePendingJobSaveClaim } from "@/lib/hooks/use-pending-job-save-claim"

/**
 * /collections — the saved-job worklist, successor of the retired /home
 * dashboard (2026-07-07 cutover). One route, two skins: the handoff mobile
 * surface and the desktop workspace (FeedCard rows + build drawer + rail).
 * Browse for unsaved matches lives on Jobs (/market); this surface owns
 * collect → tailor → apply. `?jobId=` deep-links open that job's detail.
 */
function CollectionsInner() {
  const { token, ready } = useAuth()
  const { mode } = useViewport()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")

  // Replay a job saved while logged out (Exception 2) — saves it + refreshes the list.
  usePendingJobSaveClaim(token)

  if (!ready) return null
  if (mode === "mobile") return <CollectionsSurface token={token ?? ""} initialJobId={jobId} />
  return <CollectionsDesktop token={token ?? ""} initialJobId={jobId} />
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={null}>
      <CollectionsInner />
    </Suspense>
  )
}
