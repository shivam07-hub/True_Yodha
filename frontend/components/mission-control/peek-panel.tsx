"use client"

import type { ReactNode } from "react"
import { ChevronLeft } from "lucide-react"
import { PeekSurfaces } from "./peek-surfaces"
import type { LoopStep } from "./loop-ring"

/**
 * The desktop workspace right zone (D5). Default state = the four glanceable
 * peek surfaces. When a feed card is opened, the centre lifts its job detail up
 * here (`detail`) and the surfaces step aside — no navigation, the feed keeps
 * its scroll. Closing returns to the surfaces. Mobile uses the same surfaces in
 * a horizontal strip + a full-screen detail push instead (D6).
 */
export function PeekPanel({
  token,
  steps,
  detail,
  detailTitle,
  onCloseDetail,
}: {
  token: string
  steps: LoopStep[]
  detail?: ReactNode | null
  detailTitle?: string | null
  onCloseDetail?: () => void
}) {
  return (
    <aside className="mc-peek" aria-label="Context panel">
      {detail ? (
        <div className="mc-peek-detail">
          <div className="mc-peek-detail-top">
            <button type="button" className="mc-peek-back tm-control-focus" onClick={onCloseDetail} aria-label="Close detail">
              <ChevronLeft size={15} aria-hidden /> Back
            </button>
            {detailTitle ? <span className="mc-peek-detail-ttl">{detailTitle}</span> : null}
          </div>
          <div className="mc-peek-detail-scroll">{detail}</div>
        </div>
      ) : (
        <PeekSurfaces token={token} steps={steps} />
      )}
    </aside>
  )
}

/**
 * Mobile incarnation of the right zone (D6) — the same four surfaces, laid out
 * as a swipeable horizontal strip above the feed. Same content model, different
 * geometry: one source, two shapes (the conceptual-integrity guarantee).
 */
export function MobilePeekStrip({ token, steps }: { token: string; steps: LoopStep[] }) {
  return (
    <div className="mc-peek-strip" role="list" aria-label="Your context">
      <PeekSurfaces token={token} steps={steps} />
    </div>
  )
}
