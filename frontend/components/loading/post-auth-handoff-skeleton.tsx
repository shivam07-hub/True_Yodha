"use client"

import { hasPendingAnonCvClaim } from "@/lib/anon-cv-claim"
import { hasPendingJobSaveClaim } from "@/lib/anon-job-stash"
import { readPendingExtensionConnect } from "@/lib/extension-connect-stash"
import {
  CvSkeleton,
  DashboardSkeleton,
  GenericPageSkeleton,
  MarketSkeleton,
} from "@/components/loading/page-skeletons"

/**
 * Shaped first paint for OAuth/magic-link and partner handoffs while the session
 * resolves. Uses carried intent when we can read it from storage; otherwise the
 * daily surface (/market) shape — never a full-screen teal field with no layout.
 */
export function PostAuthHandoffSkeleton() {
  if (readPendingExtensionConnect()) return <GenericPageSkeleton />
  if (hasPendingAnonCvClaim()) return <CvSkeleton />
  if (hasPendingJobSaveClaim()) return <DashboardSkeleton />
  return <MarketSkeleton />
}
