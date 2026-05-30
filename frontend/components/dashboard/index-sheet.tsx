"use client"

import * as React from "react"
import type { FeedItem } from "@/lib/dashboard/feed-model"

/** Mobile pull-up scan list (Q5) — the bird's-eye a pure feed loses. */
export function IndexSheet({
  items,
  currentJobId,
  onJump,
  onClose,
}: {
  items: FeedItem[]
  currentJobId: string | null
  onJump: (jobId: string) => void
  onClose: () => void
}) {
  const [drag, setDrag] = React.useState(0)
  const start = React.useRef<number | null>(null)

  return (
    <>
      <div className="db-sheet-scrim" onClick={onClose} />
      <div
        className="db-sheet"
        style={{ transform: drag > 0 ? `translateY(${drag}px)` : undefined, transition: drag > 0 ? "none" : undefined }}
      >
        <div
          className="db-sheet-handle"
          role="button"
          aria-label="Close list"
          onTouchStart={(e) => { start.current = e.touches[0].clientY }}
          onTouchMove={(e) => { if (start.current != null) { const d = e.touches[0].clientY - start.current; if (d > 0) setDrag(d) } }}
          onTouchEnd={() => { if (drag > 80) onClose(); setDrag(0); start.current = null }}
        >
          <span />
        </div>
        <div className="db-sheet-title">{items.length} in your feed</div>
        <div className="db-sheet-rows">
          {items.map((it) => (
            <button
              key={it.jobId}
              type="button"
              className={`db-sheet-row${it.jobId === currentJobId ? " current" : ""}`}
              onClick={() => onJump(it.jobId)}
            >
              <span className="co">{it.company ?? "—"}</span>
              <span className="role">{it.role}</span>
              {it.fit != null ? <span className="fit">{it.fit}%</span> : <span className="fit">★</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
