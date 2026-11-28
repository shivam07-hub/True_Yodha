"use client"

/**
 * The gap door (ENG6, ARCHITECTURE_PAYMENTS.md §10.2). Right after the Myro
 * Score on the CV page, where people have just seen their gap: a person reads
 * the CV against the job they want, then a 30-minute call (₹199); or all of it
 * worked through on three calls (₹599, §10.3). 503 people reached a score; 29
 * ever reached the Preparation room's line.
 *
 * The same card sits under a Preparation room's four steps (ONE_PREP P3), the
 * one upskilling home. In a job room it is about THAT job: a held check is
 * spent on it, a bought one arrives queued on it, and a check already open for
 * it says so on the room's record line instead of selling a second.
 *
 * A Human Check already held is spent from here instead of bought again. The
 * price comes from the catalogue: with nothing sellable there is no card.
 */

import Link from "next/link"

import { ApplyPackBuy } from "@/components/apply-pack/apply-pack-buy"
import { heldCheck, useHumanChecks, useSpendCheck } from "@/components/apply-pack/use-human-checks"
import { SaleOffer } from "@/components/sale-gate"
import { Button } from "@/components/ui/button"
import { rupees, sellable, useCatalogue } from "@/lib/use-catalogue"
import "./apply-pack.css"

export function PackOffer({
  token,
  surface = "cv",
  jobId,
}: {
  token: string
  /** Where the card sits, recorded on the order. */
  surface?: "cv" | "room"
  /** A job room's job: the check is spent on, or bought for, this job. */
  jobId?: string
}) {
  const checksQ = useHumanChecks(token)
  const catalogueQ = useCatalogue()
  const { spend, spending, error } = useSpendCheck(token)

  if (checksQ.isLoading || catalogueQ.isLoading) return null
  const checks = checksQ.data ?? []
  // A check already running for this job is the room's record line's to show.
  if (jobId && checks.some((c) => c.kind === "cv_job" && c.job_id === jobId)) return null
  const held = heldCheck(checks)
  // The LinkedIn card lives on the CV page; from anywhere else, go there.
  const linkedinHref = surface === "cv" ? "#linkedin" : "/cv?view=cv#linkedin"

  if (held) {
    return (
      <section className="hc-card" aria-label="Your Human Check">
        <div className="hc-card-head">
          <h2 className="hc-card-title">You hold a Human Check</h2>
          <span className="hc-card-meta">A person, then a 30-min call</span>
        </div>
        <div className="ap-held-uses">
          {jobId ? (
            <Button variant="outline" size="sm" onClick={() => void spend(held.id, jobId)} loading={spending}>
              {spending ? "Using…" : "Use it on this job"}
            </Button>
          ) : (
            <Link className="tm-link" href="/collections">Use it on a job</Link>
          )}
          <Link className="tm-link" href={linkedinHref}>Use it on LinkedIn</Link>
        </div>
        {error ? <span className="ap-buy-error" role="status">{error}</span> : null}
      </section>
    )
  }

  if (!sellable(catalogueQ.data, "apply_pack")) return null
  const fullPack = sellable(catalogueQ.data, "filing_intake")

  return (
    <SaleOffer>
      <section className="hc-card" aria-label="A person reads your CV">
        <div className="hc-card-head">
          <h2 className="hc-card-title">A person reads your CV</h2>
          <span className="hc-card-meta">Back within 24 hours</span>
        </div>
        <p className="hc-card-note">
          Checked by a reviewer, not AI, against {jobId ? "this job" : "the job you want"}. Then a 30-minute call to walk you through it.
        </p>
        <ApplyPackBuy jobId={jobId} surface={surface} label="Book a review" />
        {fullPack ? (
          <p className="hc-card-note hc-card-more">
            <Link className="tm-link" href="/filing">
              Three calls: your CV, your LinkedIn and your search · {rupees(fullPack.price_paise)}
            </Link>
          </p>
        ) : null}
      </section>
    </SaleOffer>
  )
}
