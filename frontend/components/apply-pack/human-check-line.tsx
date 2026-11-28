"use client"

/**
 * The stakes door, beside the CV they are about to send (#56, ENG2). One line,
 * not a card. The line IS the state: due, checked, or the way to get one; under
 * an open check, the 30-minute call it ends in (ENG5).
 */

import Link from "next/link"

import { ApplyPackBuy } from "@/components/apply-pack/apply-pack-buy"
import { CallContact } from "@/components/apply-pack/call-contact"
import { heldCheck, useHumanChecks, useSpendCheck } from "@/components/apply-pack/use-human-checks"
import { SaleOffer } from "@/components/sale-gate"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"
import { rupees, sellable, useCatalogue } from "@/lib/use-catalogue"
import "./apply-pack.css"

export function HumanCheckLine({
  token,
  jobId,
  offer = true,
}: {
  token: string
  jobId: string
  /** False where the page already sells the check in its own card (a
   *  Preparation room, ONE_PREP P3): the line then states the check only. */
  offer?: boolean
}) {
  const checksQ = useHumanChecks(token)
  const catalogueQ = useCatalogue()
  const { spend, spending, error } = useSpendCheck(token)

  if (checksQ.isLoading) return null
  const checks = checksQ.data ?? []
  const forJob = checks.find((c) => c.kind === "cv_job" && c.job_id === jobId) ?? null

  if (forJob?.status === "delivered") {
    return (
      <span className="hc-line">
        <span className="hc-line-state">Checked by {forJob.reviewer_name}</span>
        {forJob.note ? <span className="hc-line-note">{forJob.note}</span> : null}
        <CallContact token={token} check={forJob} />
      </span>
    )
  }
  if (forJob) {
    return (
      <span className="hc-line">
        <span className="hc-line-state">Human check · due {formatDateTime(forJob.due_at ?? "")}</span>
        <CallContact token={token} check={forJob} />
      </span>
    )
  }

  if (!offer) return null
  const held = heldCheck(checks)
  if (held) {
    return (
      <span className="hc-line">
        <Button variant="outline" size="sm" onClick={() => void spend(held.id, jobId)} loading={spending}>
          {spending ? "Using…" : "Use your human check"}
        </Button>
        {error ? <span className="ap-buy-error" role="status">{error}</span> : null}
      </span>
    )
  }

  const fullPack = sellable(catalogueQ.data, "filing_intake")
  return (
    <SaleOffer>
      <span className="hc-line">
        <ApplyPackBuy jobId={jobId} surface="stakes" label="Human check before you apply" />
        {fullPack ? (
          <Link className="tm-link" href="/filing">Three calls · {rupees(fullPack.price_paise)}</Link>
        ) : null}
      </span>
    </SaleOffer>
  )
}
