"use client"

import { usePathname } from "next/navigation"
import { skeletonForPath } from "@/components/loading/page-skeletons"

/** Route-matched skeleton for Next.js `loading.tsx` boundaries. */
export function RouteMatchedSkeleton() {
  const pathname = usePathname()
  return <>{skeletonForPath(pathname)}</>
}
