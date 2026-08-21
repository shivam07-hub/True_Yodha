import Link from "next/link"
import { ArrowRight } from "lucide-react"

/**
 * Closing strip: the project is open, the data is shared with colleges, and the
 * market read ships as a newsletter. Subscription itself lives on /newsletter —
 * this only points there.
 *
 * Structure carries the difference. These were three identical cards in a row
 * until 2026-08-20, which is the template shape (ANTI_SLOP.md §6) and — worse —
 * it flattened three things that aren't peers. Two of them are DOORS: "this is
 * also for you", addressed to a reader who isn't the job seeker the rest of the
 * page is written for. The third is a CLAIM about how we work, and it is
 * checkable — so it reads as a fact with its evidence attached, not as a card
 * selling itself. A verifiable thing doesn't need a box.
 */
export function LandingCommons() {
  return (
    <section className="lp-commons" aria-label="Open source, colleges and the newsletter">
      <div className="lp-wrap">
        <p className="lp-commons-note">
          <span className="lp-eyebrow lp-commons-note-eyebrow">Open by default</span>
          <span className="lp-commons-note-body">
            MIT licensed. The scraper, the taxonomy and the scoring are all readable. Fork it, or
            check our maths.
          </span>
          <a
            className="lp-commons-link"
            href="https://github.com/shivam07-hub/True_Yodha"
            target="_blank"
            rel="noreferrer"
          >
            read the source <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </p>

        <div className="lp-commons-doors">
          <article className="lp-commons-card">
            <p className="lp-eyebrow">For colleges</p>
            <p className="lp-commons-body">
              Placement cells see the same live demand data their students are being measured
              against.
            </p>
            <Link className="lp-commons-link" href="/institutions">
              talk to us <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </article>

          <article className="lp-commons-card">
            <p className="lp-eyebrow">Newsletter</p>
            <p className="lp-commons-body">
              One reading of the Indian MNC market each weekday. Hiring heatmaps, skills, layoff
              watch.
            </p>
            <Link className="lp-commons-link" href="/newsletter">
              subscribe <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </article>
        </div>
      </div>
    </section>
  )
}
