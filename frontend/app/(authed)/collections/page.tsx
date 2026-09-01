"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/hooks/use-auth"
import { useViewport } from "@/mobile"
import { CollectionsSurface } from "@/mobile/redesign/collections-surface"
import { CollectionsDesktop } from "@/components/collections/collections-desktop"
import { FirstSuccessChecklist } from "@/components/onboarding/first-success-checklist"
import { SetupNudge } from "@/components/common/setup-nudge"
import { DashboardSkeleton } from "@/components/loading/page-skeletons"

/**
 * /collections — the saved-job worklist, successor of the retired /home
 * dashboard (2026-07-07 cutover). One route, two skins: the handoff mobile
 * surface and the desktop workspace (FeedCard rows + build drawer + rail).
 * Browse for unsaved matches lives on Jobs (/market); this surface owns
 * collect → tailor → apply. `?jobId=` deep-links open that job's detail.
 *
 * It is also a post-auth LANDING (postAuthDestination Exception 2): someone who
 * saved a job while logged out arrives here straight from signup, holding one
 * saved role and no CV. Collect → tailor → apply all need a baseline, so the
 * spine nudge belongs here as much as on /market.
 */
function CollectionsInner() {
  const { token, ready } = useAuth()
  const { mode } = useViewport()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")
  // Deep-link from the Loop Bar "N new" signal (Slice 5) — open the pre-flight gate.
  const openSearch = searchParams.get("search") === "1"

  if (!ready) return <DashboardSkeleton />
  if (mode === "mobile")
    return (
      <>
        <div className="px-4 pt-4"><SetupNudge token={token} /></div>
        {token ? <div className="px-4 pt-4"><FirstSuccessChecklist token={token} /></div> : null}
        <CollectionsSurface token={token ?? ""} initialJobId={jobId} openSearch={openSearch} />
      </>
    )
  return (
    <>
      <SetupNudge token={token} style={{ margin: "20px 24px 0" }} />
      <CollectionsDesktop token={token ?? ""} initialJobId={jobId} openSearch={openSearch} />
    </>
  )
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <CollectionsInner />
    </Suspense>
  )
}
