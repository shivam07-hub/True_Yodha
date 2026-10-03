"use client"

import Link from "next/link"
import type { MarketJudgment } from "@/lib/api"
import { WeaveLoom } from "@/components/cv/builder/mentor-thinking"
import { aspirationCount } from "@/lib/market/aspiration-count"
import "./market.css"

const READ_LINES = [
  "Opening roles in your direction.",
  "Reading them against your CV.",
  "Keeping the ones worth your time.",
]

/**
 * The feed's one sentence once a read has a cause, or the CV on screen is
 * the one they replaced. The link is that cause. A read that has only just
 * started is not a reason to open the CV.
 */
export function MarketJudgmentNote({
  judgment,
}: {
  judgment: MarketJudgment | null | undefined
}) {
  if (!judgment?.notice) return null
  const offerCv = Boolean(judgment.cv_replaced) || judgment.cause === "skills"
  return (
    <p className="tm-feed-weak-note" role={judgment.reading ? "status" : undefined} data-market-judgment="">
      {judgment.notice}
      {offerCv ? (
        <>
          {" "}
          <Link className="tm-link" href="/cv">Open your CV</Link>
        </>
      ) : null}
    </p>
  )
}

/** The same loom the CV uses, on the jobs column's left edge, once a warm
 *  has actually been accepted. The count is the read, not a finished verdict. */
export function AspirationRead({ judgment }: { judgment: MarketJudgment }) {
  const line = aspirationCount(judgment.read, judgment.pending, judgment.cleared)
  return (
    <div>
      <WeaveLoom align="inline" lines={READ_LINES} settled={false} />
      {line ? <p className="tm-feed-read">{line}</p> : null}
    </div>
  )
}
