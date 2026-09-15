"use client"

import type { ReactNode } from "react"
import "@/app/(authed)/home/mission-control.css"

/** Feed template for /market: 732 column, 316 rail on the right. Drawers
 *  stay outside the grid so they cannot become a third track. */
export function MarketFeedFrame({
  header,
  railHead,
  children,
  rail,
  extras,
}: {
  header?: ReactNode
  railHead?: ReactNode
  children: ReactNode
  rail: ReactNode
  extras?: ReactNode
}) {
  return (
    <>
      <div className="mc-workspace">
        <div className="mc-ws-main">
          {header}
          {children}
        </div>
        <div className="mc-ws-rail tm-market-rail">
          {railHead}
          {rail}
        </div>
      </div>
      {extras}
    </>
  )
}
