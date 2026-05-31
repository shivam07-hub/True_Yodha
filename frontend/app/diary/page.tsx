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
    // Diary merged into Practice; the standalone rail was retired in the
    // Practice × Skill-Intelligence merge. Preserve deep-link params
    // (?skill=, ?jobId=) but drop the now-meaningless ?diary= rail flag.
    const params = new URLSearchParams(searchParams.toString())
    params.delete("diary")
    const qs = params.toString()
    router.replace(qs ? `/forge?${qs}` : "/forge")
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
