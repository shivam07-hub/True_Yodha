"use client"

/**
 * /diary is now merged into /forge.
 * This file redirects to /forge, preserving any query params (?jobId=, ?milestoneId=, etc.)
 * so that deep-links from /tracker and pipeline cards continue to work.
 */

import { useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function DiaryRedirectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    const params = new URLSearchParams(qs)
    params.set("diary", "1")
    router.replace(`/forge?${params.toString()}`)
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
