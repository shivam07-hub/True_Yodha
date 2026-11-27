"use client"

/**
 * The gap door (ENG6, ARCHITECTURE_PAYMENTS.md §10.2). Right after the Myro
 * Score on the CV page, where people have just seen their gap: a person reads
 * the CV against the job they want, then a 30-minute call. 503 people reached
 * a score; 29 ever reached the Preparation room's line.
 *
 * A Human Check already held is spent from here instead of bought again. The
 * price comes from the catalogue: with nothing sellable there is no card.
 */

import Link from "next/link"

import { ApplyPackBuy } from "@/components/apply-pack/apply-pack-buy"
import { heldCheck, useHumanChecks } from "@/components/apply-pack/use-human-checks"
import { SaleOffer } from "@/components/sale-gate"
import { sellable, useCatalogue } from "@/lib/use-catalogue"
import "./apply-pack.css"

export function PackOffer({ token }: { token: string }) {
  const checksQ = useHumanChecks(token)
  const catalogueQ = useCatalogue()

  if (checksQ.isLoading || catalogueQ.isLoading) return null
  const held = heldCheck(checksQ.data)

  if (held) {
    return (
      <section className="hc-card" aria-label="Your Human Check">
        <div className="hc-card-head">
          <h2 className="hc-card-title">You hold a Human Check</h2>
          <span className="hc-card-meta">A person, then a 30-min call</span>
        </div>
        <div className="ap-held-uses">
          <Link className="tm-link" href="/collections">Use it on a job</Link>
          <Link className="tm-link" href="#linkedin">Use it on LinkedIn</Link>
        </div>
      </section>
    )
  }

  if (!sellable(catalogueQ.data, "apply_pack")) return null

  return (
    <SaleOffer>
      <section className="hc-card" aria-label="A person reads your CV">
        <div className="hc-card-head">
          <h2 className="hc-card-title">A person reads your CV</h2>
          <span className="hc-card-meta">Back within 24 hours</span>
        </div>
        <p className="hc-card-note">
          Checked by a reviewer, not AI, against the job you want. Then a 30-minute call to walk you through it.
        </p>
        <ApplyPackBuy label="Book a review" />
      </section>
    </SaleOffer>
  )
}
