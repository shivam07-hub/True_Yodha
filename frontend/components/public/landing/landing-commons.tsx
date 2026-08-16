import Link from "next/link"
import { ArrowRight } from "lucide-react"

/** Closing three-card strip: the project is open, the data is shared with
 *  colleges, and the market read ships as a newsletter. Subscription itself
 *  lives on /newsletter — this only points there. */
export function LandingCommons() {
  return (
    <section className="lp-commons" aria-label="Open source, colleges and the newsletter">
      <div className="lp-wrap lp-commons-grid">
        <article className="lp-commons-card">
          <p className="lp-eyebrow">Open by default</p>
          <p className="lp-commons-body">
            MIT licensed. The scraper, the taxonomy and the scoring are all readable. Fork it, or
            check our maths.
          </p>
          <a
            className="lp-commons-link"
            href="https://github.com/shivam07-hub/True_Yodha"
            target="_blank"
            rel="noreferrer"
          >
            read the source <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </article>

        <article className="lp-commons-card">
          <p className="lp-eyebrow">For colleges</p>
          <p className="lp-commons-body">
            Placement cells see the same live demand data their students are being measured against.
          </p>
          <Link className="lp-commons-link" href="/institutions">
            talk to us <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </article>

        <article className="lp-commons-card">
          <p className="lp-eyebrow">Newsletter</p>
          <p className="lp-commons-body">
            One reading of the Indian MNC market each weekday. Hiring heatmaps, skills, layoff watch.
          </p>
          <Link className="lp-commons-link" href="/newsletter">
            subscribe <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </article>
      </div>
    </section>
  )
}
