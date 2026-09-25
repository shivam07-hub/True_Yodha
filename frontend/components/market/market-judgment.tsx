"use client"

import Link from "next/link"
import type { MarketJudgment } from "@/lib/api"
import "./market.css"

/**
 * The feed's one sentence while jobs are still being read, or once the
 * short list has a cause. Same note the weak shortlist already uses.
 * The link is the action; the sentence is not a second one.
 */
export function MarketJudgmentNote({
  judgment,
}: {
  judgment: MarketJudgment | null | undefined
}) {
  if (!judgment?.notice) return null
  const offerCv = judgment.reading || judgment.cause === "skills"
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
