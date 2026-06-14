import Link from "next/link"
import { Briefcase, Target, Zap, Trophy } from "lucide-react"
import styles from "./journey-loop.module.css"

// The core value of Myro Weekly, drawn as one connected loop. Everyday nouns;
// the design (icons + flow + arrows) carries the intuition so it reads without
// reading. Single entry CTA respects the accent budget.
const STEPS = [
  { Icon: Briefcase, noun: "Jobs", sub: "who's hiring" },
  { Icon: Target, noun: "Gaps", sub: "what you lack" },
  { Icon: Zap, noun: "Skills", sub: "what to learn" },
  { Icon: Trophy, noun: "Offers", sub: "land it" },
]

export function JourneyLoop() {
  return (
    <section className={styles.band} aria-label="How Myro Weekly works">
      <p className={styles.kicker}>Your weekly career loop</p>
      <div className={styles.flow}>
        {STEPS.map(({ Icon, noun, sub }) => (
          <div key={noun} className={styles.node}>
            <span className={styles.icon}>
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className={styles.noun}>{noun}</span>
            <span className={styles.sub}>{sub}</span>
          </div>
        ))}
      </div>
      <Link href="/signup?utm_source=newsletter_loop" className={styles.cta}>
        Get your Myro Score →
      </Link>
    </section>
  )
}
