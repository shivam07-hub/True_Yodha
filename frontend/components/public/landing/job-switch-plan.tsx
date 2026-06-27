"use client"

import { useRouter } from "next/navigation"
import { Compass, ArrowRight } from "lucide-react"
import { SectionTitle } from "@/components/public/landing/section-title"

/* ₹99 bridge — TEASER only (#33, Q5/Q7). The landing tells the user this paid
   step exists so they know what they're getting into; the real offer fires
   AUTHED at their actual skill-gap (Q6). The deliverable mechanics are still
   being designed (B-grill), so the CTA routes to signup, not a checkout.

   Honesty boundary (Q4/Q5): the name says "Switch" but the promise is
   switch-READY, never guaranteed placement. The subline holds that line. */

const POINTS = [
  "A personalised plan built from the exact gaps between your CV and the role you want",
  "A levelled path to close them — upskill or cross-skill, step by step",
  "One human checkpoint, so a real person looks at your plan, not just the algorithm",
]

export function LandingJobSwitchPlan() {
  const router = useRouter()
  return (
    <section className="lp-bridge" id="job-switch-plan" aria-label="Personalised Job-Switch Plan">
      <div className="lp-wrap">
        <div className="lp-bridge-card lp-reveal">
          <div className="lp-bridge-head">
            <span className="lp-bridge-icon" aria-hidden>
              <Compass size={22} strokeWidth={1.5} />
            </span>
            <div>
              <span className="lp-bridge-kicker">When you&apos;re ready to move</span>
              <SectionTitle>The Personalised Job-Switch Plan.</SectionTitle>
            </div>
          </div>

          <p className="lp-bridge-sub">
            A guided path to make you the obvious hire for the roles you want. We don&apos;t
            place you — we close the gap so you can. Guidance continues whether or not the
            job changes.
          </p>

          <ul className="lp-bridge-points">
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>

          <div className="lp-bridge-foot">
            <span className="lp-bridge-price">
              <strong>₹99</strong> to start
              <span className="lp-bridge-price-note">intro price</span>
            </span>
            <button type="button" className="lp-bridge-cta" onClick={() => router.push("/signup")}>
              Start with your free score
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
