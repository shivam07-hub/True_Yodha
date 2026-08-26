"use client"

import { hasPendingAnonCvClaim } from "@/lib/anon-cv-claim"
import { hasPendingJobSaveClaim } from "@/lib/anon-job-stash"
import { readPendingExtensionConnect } from "@/lib/extension-connect-stash"
import {
  DashboardSkeleton,
  GenericPageSkeleton,
  MarketSkeleton,
} from "@/components/loading/page-skeletons"
import { CVBaselineSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-baseline-skeleton"

/**
 * Shaped first paint for OAuth/magic-link and partner handoffs while the session
 * resolves. Uses carried intent when we can read it from storage; otherwise the
 * daily surface (/market) shape — never a full-screen accent field with no layout.
 */
export function PostAuthHandoffSkeleton() {
  if (readPendingExtensionConnect()) return <GenericPageSkeleton />
  // The claim lands on /cv?upload=1 — the library door, not the workstation.
  if (hasPendingAnonCvClaim()) return <CVBaselineSkeleton />
  if (hasPendingJobSaveClaim()) return <DashboardSkeleton />
  return <MarketSkeleton />
}
