"use client"

import Link from "next/link"
import { ArrowRight, Compass } from "lucide-react"

import { rupees, sellable, useCatalogue } from "@/lib/use-catalogue"
import "./intel-apply-pack.css"

const POINTS = [
  "500 Myro Coins: enough for 10 CVs tailored to the jobs you want",
  "One Human Check: a named reviewer reads your CV against one job, or rewrites your LinkedIn",
  "Back within 24 hours. Bought once, when a job matters",
]

/** The paid offer follows the live market evidence that informs it. */
export function IntelApplyPack() {
  const pack = sellable(useCatalogue().data, "apply_pack")
  return (
    <section className="tm-intel-plan" aria-labelledby="intel-plan-title">
      <div className="tm-intel-plan-card">
        <div className="tm-intel-plan-head">
          <span className="tm-intel-plan-icon" aria-hidden>
            <Compass size={22} strokeWidth={1.5} />
          </span>
          <div>
            <p className="tm-intel-plan-kicker">When a job matters</p>
            <h2 id="intel-plan-title">The Apply Pack.</h2>
          </div>
        </div>

        <ul className="tm-intel-plan-points">
          {POINTS.map((point) => <li key={point}>{point}</li>)}
        </ul>

        <div className="tm-intel-plan-foot">
          {pack ? (
            <p className="tm-intel-plan-price">
              <strong>{rupees(pack.price_paise)}</strong> <span>once</span>
            </p>
          ) : null}
          <Link href="/signup" className="tm-intel-plan-cta">
            Start with your free score <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
