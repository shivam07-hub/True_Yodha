import Link from "next/link"
import { ArrowRight } from "lucide-react"

/**
 * Closing strip: the data is shared with colleges, and the market read ships as
 * a newsletter. Subscription itself lives on /newsletter — this only points there.
 *
 * Two DOORS: "this is also for you", addressed to a reader who isn't the job
 * seeker the rest of the page is written for. The open-source claim that sat
 * above them left with the GitHub link (Shivam, 2026-11-26, spec #66 L0).
 */
export function LandingCommons() {
  return (
    <section className="lp-commons" aria-label="Colleges and the newsletter">
      <div className="lp-wrap">

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
