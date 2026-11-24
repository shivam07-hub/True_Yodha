"use client"

/**
 * The stakes door, beside the CV they are about to send (#56, ENG2). One line,
 * not a card. The line IS the state: due, checked, or the way to get one.
 */

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { ApplyPackBuy } from "@/components/apply-pack/apply-pack-buy"
import { heldCheck, useHumanChecks } from "@/components/apply-pack/use-human-checks"
import { SaleOffer } from "@/components/sale-gate"
import { Button } from "@/components/ui/button"
import { humanChecks } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatDateTime } from "@/lib/format"
import "./apply-pack.css"

export function HumanCheckLine({ token, jobId }: { token: string; jobId: string }) {
  const queryClient = useQueryClient()
  const checksQ = useHumanChecks(token)
  const [spending, setSpending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (checksQ.isLoading) return null
  const checks = checksQ.data ?? []
  const forJob = checks.find((c) => c.kind === "cv_job" && c.job_id === jobId) ?? null

  if (forJob?.status === "delivered") {
    return (
      <span className="hc-line">
        <span className="hc-line-state">Checked by {forJob.reviewer_name}</span>
        {forJob.note ? <span className="hc-line-note">{forJob.note}</span> : null}
      </span>
    )
  }
  if (forJob) {
    return (
      <span className="hc-line">
        <span className="hc-line-state">Human check · due {formatDateTime(forJob.due_at ?? "")}</span>
      </span>
    )
  }

  const held = heldCheck(checks)
  if (held) {
    const spend = async () => {
      setSpending(true)
      setError(null)
      try {
        await humanChecks.useOnJob(token, held.id, jobId)
        await queryClient.invalidateQueries({ queryKey: dataKeys.humanChecks() })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not use the check. Try again.")
      } finally {
        setSpending(false)
      }
    }
    return (
      <span className="hc-line">
        <Button variant="outline" size="sm" onClick={spend} loading={spending}>
          {spending ? "Using…" : "Use your human check"}
        </Button>
        {error ? <span className="ap-buy-error" role="status">{error}</span> : null}
      </span>
    )
  }

  return (
    <SaleOffer>
      <span className="hc-line">
        <ApplyPackBuy jobId={jobId} label="Human check before you apply" />
      </span>
    </SaleOffer>
  )
}
