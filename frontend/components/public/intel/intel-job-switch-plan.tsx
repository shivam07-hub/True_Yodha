"use client"

import Link from "next/link"
import { ArrowRight, Compass } from "lucide-react"
import "./intel-job-switch-plan.css"

const POINTS = [
  "A personalised plan built from the exact gaps between your CV and the role you want",
  "A levelled path to close them — upskill or cross-skill, step by step",
  "One human checkpoint, so a real person looks at your plan, not just the algorithm",
]

/** The paid guidance offer follows the live market evidence that informs it. */
export function IntelJobSwitchPlan() {
  return (
    <section className="tm-intel-plan" aria-labelledby="intel-plan-title">
      <div className="tm-intel-plan-card">
        <div className="tm-intel-plan-head">
          <span className="tm-intel-plan-icon" aria-hidden>
            <Compass size={22} strokeWidth={1.5} />
          </span>
          <div>
            <p className="tm-intel-plan-kicker">When you&apos;re ready to move</p>
            <h2 id="intel-plan-title">The Personalised Job-Switch Plan.</h2>
          </div>
        </div>

        <p className="tm-intel-plan-summary">
          A guided path to make you the obvious hire for the roles you want. We don&apos;t
          place you — we close the gap so you can. Guidance continues whether or not the
          job changes.
        </p>

        <ul className="tm-intel-plan-points">
          {POINTS.map((point) => <li key={point}>{point}</li>)}
        </ul>

        <div className="tm-intel-plan-foot">
          <p className="tm-intel-plan-price">
            <strong>₹99</strong> to start <span>intro price</span>
          </p>
          <Link href="/signup" className="tm-intel-plan-cta">
            Start with your free score <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
