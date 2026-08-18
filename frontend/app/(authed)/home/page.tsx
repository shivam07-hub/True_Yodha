"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { MarketSkeleton } from "@/components/loading/page-skeletons"

/**
 * /home — RETIRED (2026-07-07 Collections cutover). The old dashboard fused
 * two products: browsing unsaved Myro matches (now Jobs, /market — the feed
 * brain-ranks the shortlist and carries the match-refresh gate) and the
 * saved-job worklist (now Collections, /collections — finish-tailoring lane,
 * triage order, trust rows, the full build drawer).
 *
 * This stub only preserves old links: `?jobId=` deep-links (extension, emails)
 * carry into Collections detail; everything else lands on Jobs.
 */
function HomeRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  useEffect(() => {
    const jobId = searchParams.get("jobId")
    router.replace(jobId ? `/collections?jobId=${encodeURIComponent(jobId)}` : "/market")
  }, [router, searchParams])
  return <MarketSkeleton />
}

export default function HomePage() {
  return (
    <Suspense fallback={<MarketSkeleton />}>
      <HomeRedirect />
    </Suspense>
  )
}
