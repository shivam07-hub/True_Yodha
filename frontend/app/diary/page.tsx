"use client"

/**
 * /diary is now merged into /home.
 * This file redirects to /home, preserving any query params (?jobId=, ?milestoneId=, etc.)
 * so that deep-links from /tracker and pipeline cards continue to work.
 */

import { useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function DiaryRedirectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    router.replace(qs ? `/home?${qs}#forge-section` : "/home#forge-section")
  }, [router, searchParams])

  return null
}

export default function DiaryPage() {
  return (
    <Suspense>
      <DiaryRedirectInner />
    </Suspense>
  )
}
