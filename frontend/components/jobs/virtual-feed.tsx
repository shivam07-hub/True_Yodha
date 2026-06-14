"use client"

import * as React from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"

export interface VirtualFeedProps<T> {
  items: T[]
  getKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => React.ReactNode
  /** First-paint height guess per card; real heights are measured after mount. */
  estimateSize?: number
  /** Vertical gap between cards (px). */
  gap?: number
  /** Cards to render beyond the viewport each side (smooths fast scroll). */
  overscan?: number
  /** Class on the relative container (carries the feed's max-width). */
  className?: string
}

/**
 * Window-scrolled virtual feed. Renders only the cards near the viewport, so a
 * 1,000-row feed stays as light as a 10-row one (X / LinkedIn). The page itself
 * scrolls — not an inner box — so it composes with the existing topbar and the
 * infinite-load sentinel below it.
 *
 * `scrollMargin` is the list's distance from the top of the document; the
 * virtualizer subtracts it so item offsets line up with page scroll. Re-measured
 * on mount and resize because content above the feed (filters, summary) can
 * change height.
 */
export function VirtualFeed<T>({
  items, getKey, renderItem, estimateSize = 180, gap = 14, overscan = 6, className,
}: VirtualFeedProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = React.useState(0)

  React.useLayoutEffect(() => {
    const measure = () => {
      const el = parentRef.current
      if (!el) return
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    scrollMargin,
  })

  return (
    <div ref={parentRef} className={className} style={{ position: "relative", width: "100%", height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((vi) => (
        <div
          key={getKey(items[vi.index], vi.index)}
          data-index={vi.index}
          ref={virtualizer.measureElement}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start - scrollMargin}px)` }}
        >
          {renderItem(items[vi.index], vi.index)}
        </div>
      ))}
    </div>
  )
}
