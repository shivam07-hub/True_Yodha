"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

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

/** Nearest scrollable ancestor (overflow-y auto|scroll). The authed shell
 *  scrolls an inner `.tm-main-scroll` box, NOT the window, so the virtualizer
 *  must observe that element — observing `window` leaves scrollTop pinned at 0
 *  and only ~one viewport of cards ever renders. Falls back to the document
 *  scrolling element for any window-scrolled surface. */
function findScrollParent(el: HTMLElement | null): HTMLElement {
  let node = el?.parentElement ?? null
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === "auto" || oy === "scroll") return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement
}

/**
 * Scroll-container virtual feed. Renders only the cards near the viewport, so a
 * 1,000-row feed stays as light as a 10-row one (X / LinkedIn). It virtualizes
 * against its nearest scrollable ancestor (the app shell's `.tm-main-scroll`),
 * so it composes with the fixed topbar and the infinite-load sentinel below it.
 *
 * `scrollMargin` is the list's distance from the top of the scroll container's
 * content; the virtualizer offsets item positions by it. Re-measured on mount
 * and resize because content above the feed (filters, summary) can change height.
 */
export function VirtualFeed<T>({
  items, getKey, renderItem, estimateSize = 180, gap = 14, overscan = 6, className,
}: VirtualFeedProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = React.useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = React.useState(0)

  React.useLayoutEffect(() => {
    const el = parentRef.current
    if (!el) return
    const sc = findScrollParent(el)
    setScrollEl(sc)
    const measure = () => {
      const node = parentRef.current
      if (!node) return
      const scTop = sc === document.scrollingElement || sc === document.documentElement
        ? 0
        : sc.getBoundingClientRect().top
      setScrollMargin(node.getBoundingClientRect().top - scTop + sc.scrollTop)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    scrollMargin,
  })

  return (
    <div ref={parentRef} className={className} style={{ position: "relative", width: "100%", height: virtualizer.getTotalSize() - scrollMargin }}>
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
