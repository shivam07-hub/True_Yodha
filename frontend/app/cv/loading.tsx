"use client"

import { CVBaselineSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-baseline-skeleton"
import { CVPlaygroundSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-playground-skeleton"

export default function CVLoading() {
  // Safe to read synchronously: this component only renders client-side,
  // and the URL is already updated by the router before loading.tsx mounts.
  const hasJobId =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("jobId")

  return hasJobId ? <CVPlaygroundSkeleton /> : <CVBaselineSkeleton />
}
