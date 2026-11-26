import Link from "next/link"
import { ScoreRing } from "@/components/skills/score-ring"

/** Logged-in top-of-page — the marketing pitch is replaced by the viewer's own
 * readout (grill Q4=B / Q5=A). Score ring + tier anchor the page so every fit %
 * below reads "relative to me"; no CV → the one honest CTA. */
export function IntelAuthedHeader({
  score, hasCv,
}: { score: number | null; hasCv: boolean }) {
  return (
    <section className="tm-intel-mc tm-intel-mc-authed">
      <div className="tm-intel-mc-headline">
        <div className="tm-intel-eyebrow">
          <span className="tm-intel-live-dot" />
          <span className="tm-intel-eyebrow-accent">YOUR LIVE MARKET</span>
        </div>
        <h1 className="sr-only">Your live job-market intel</h1>
        {hasCv && score != null ? (
          <>
            <div className="tm-intel-authed-readout">
              <ScoreRing score={score} />
            </div>
            <p className="tm-intel-lede">
              Live roles scored against your CV. Pick a company to see your fit.
            </p>
          </>
        ) : (
          <>
            <p className="tm-intel-lede tm-intel-lede-lead">
              Live roles across the market —{" "}
              <span className="tm-intel-ink">upload your CV</span> to score your fit
              against every one.
            </p>
            <div className="tm-intel-ctas">
              <Link href="/cv?upload=1" className="tm-intel-btn-primary">
                Upload your CV to see your fit
                <span className="tm-intel-arrow">→</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
