"use client"

import { Suspense } from "react"
import { useAuth } from "@/lib/hooks/use-auth"
import { ReachDesk } from "@/components/reach/reach-desk"
import { ReachSkeleton } from "@/components/loading/page-skeletons"

/**
 * /reach — the send ledger (ADR-0018 Path 3). Entered from Collections and
 * from a job's Reach section. You find the person; you send; Myro records it.
 */
export default function ReachPage() {
  const { token, ready } = useAuth()
  if (!ready) return <ReachSkeleton />
  return (
    <Suspense fallback={<ReachSkeleton />}>
      <ReachDesk token={token ?? ""} />
    </Suspense>
  )
}
