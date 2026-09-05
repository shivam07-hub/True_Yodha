"use client"

import { useAuth } from "@/lib/hooks/use-auth"
import { AuditRoom } from "@/components/preparations/audit-room"
import { PrepSkeleton } from "@/components/preparations/prep-skeleton"
import "@/components/preparations/preparations.css"

/**
 * /preparations/audit — the AI Workflow Audit room.
 *
 * Lives under Preparations because that is where someone who has applied for
 * jobs already is, and the audit is about the work they do rather than the work
 * they are applying for.
 */
export default function AuditPage() {
  const { token, ready } = useAuth()
  if (!ready) return <PrepSkeleton />
  return (
    <div className="tm-intel-page prp-workspace-page">
      <AuditRoom token={token ?? ""} />
    </div>
  )
}
