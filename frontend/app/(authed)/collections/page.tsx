"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/hooks/use-auth"
import { useViewport } from "@/mobile"
import { CollectionsSurface } from "@/mobile/redesign/collections-surface"
import { CollectionsDesktop } from "@/components/collections/collections-desktop"
import { FirstSuccessChecklist } from "@/components/onboarding/first-success-checklist"

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
  // Deep-link from the Loop Bar "N new" signal (Slice 5) — open the pre-flight gate.
  const openSearch = searchParams.get("search") === "1"

  if (!ready) return null
  if (mode === "mobile")
    return (
      <>
        {token ? <div className="px-4 pt-4"><FirstSuccessChecklist token={token} /></div> : null}
        <CollectionsSurface token={token ?? ""} initialJobId={jobId} openSearch={openSearch} />
      </>
    )
  return <CollectionsDesktop token={token ?? ""} initialJobId={jobId} openSearch={openSearch} />
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={null}>
      <CollectionsInner />
    </Suspense>
  )
}
