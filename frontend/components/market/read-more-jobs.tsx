"use client"

import { useState } from "react"
import type { MarketJudgment } from "@/lib/api"

/** The foot of a full list: the drain stopped at 40 good jobs and the pile
 *  still has unread ones (ADR-0027). The person pulls the next read. Styled by
 *  `.tm-feed-readmore` in market.css, which the market page already loads. */
export function ReadMoreJobs({
  judgment,
  onReadMore,
}: {
  judgment: MarketJudgment | null | undefined
  onReadMore: () => Promise<void>
}) {
  const [asking, setAsking] = useState(false)
  if (!judgment?.can_read_more) return null
  return (
    <div className="tm-feed-listend">
      <button
        type="button"
        className="tm-feed-readmore"
        disabled={asking}
        aria-busy={asking}
        onClick={async () => {
          setAsking(true)
          try {
            await onReadMore()
          } finally {
            setAsking(false)
          }
        }}
      >
        Read more jobs
      </button>
    </div>
  )
}
