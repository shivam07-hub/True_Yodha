import Link from "next/link"
import { Briefcase, Target, Zap, Trophy } from "lucide-react"
import styles from "./journey-loop.module.css"

// The core loop, as a compact clickable section nav beside the masthead.
// Everyday nouns; each node filters the feed to its stage (editorial browsing).
// Design carries the intuition — no CTA, no billboard.
export const LOOP_STEPS = [
  { stage: "jobs", Icon: Briefcase, noun: "Jobs", sub: "who's hiring" },
  { stage: "gaps", Icon: Target, noun: "Gaps", sub: "what you lack" },
  { stage: "skills", Icon: Zap, noun: "Skills", sub: "what to learn" },
  { stage: "offers", Icon: Trophy, noun: "Offers", sub: "land it" },
] as const

export function JourneyLoop({ activeStage }: { activeStage?: string }) {
  return (
    <nav className={styles.loop} aria-label="Browse by stage">
      <p className={styles.kicker}>Your weekly loop</p>
      <div className={styles.flow}>
        {LOOP_STEPS.map(({ stage, Icon, noun, sub }) => {
          const active = activeStage === stage
          return (
            <Link
              key={stage}
              href={active ? "/newsletter" : `/newsletter?stage=${stage}`}
              className={styles.node}
              data-active={active}
              aria-current={active ? "true" : undefined}
            >
              <span className={styles.icon}>
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className={styles.noun}>{noun}</span>
              <span className={styles.sub}>{sub}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
