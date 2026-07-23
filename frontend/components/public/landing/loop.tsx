"use client"

import { Briefcase, Target, Zap, Trophy, type LucideIcon } from "lucide-react"
import { SectionTitle } from "@/components/public/landing/section-title"

interface Stage {
  noun: string
  sub: string
  Icon: LucideIcon
}

/* The weekly loop — the recurring cycle a Myro user lives in, moved off the
   newsletter (backlog #33 declutter). HowItWorks above is the one-time way in
   (Upload → Score → Tailor); this is the four moves that then repeat every week.
   No per-node links: the single entry point stays the hero CV-drop, so the loop
   reads as the mental model, not four competing CTAs. Copy stays observational
   per landing voice rules. */
const STAGES: Stage[] = [
  { noun: "Jobs",   sub: "who's hiring",  Icon: Briefcase },
  { noun: "Gaps",   sub: "what you lack", Icon: Target },
  { noun: "Skills", sub: "what to learn", Icon: Zap },
  { noun: "Offers", sub: "land it",       Icon: Trophy },
]

export function LandingLoop() {
  return (
    <section className="lp-loop" id="the-loop" aria-label="The weekly loop">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <SectionTitle>The weekly loop.</SectionTitle>
          <p className="lp-section-sub">
            One way in, then the same four moves every week — who&apos;s hiring, what you
            lack, what to learn, and how you land it.
          </p>
        </div>

        <ol className="lp-loop-flow lp-reveal">
          {STAGES.map(({ noun, sub, Icon }) => (
            <li className="lp-loop-node" key={noun}>
              <span className="lp-loop-icon" aria-hidden>
                <Icon size={20} strokeWidth={1.5} />
              </span>
              <span className="lp-loop-noun">{noun}</span>
              <span className="lp-loop-sub">{sub}</span>
            </li>
          ))}
        </ol>

        <p className="lp-loop-repeat lp-reveal" aria-hidden>
          ↻ and again next week
        </p>
      </div>
    </section>
  )
}
