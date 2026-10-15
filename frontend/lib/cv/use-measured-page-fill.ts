"use client"

import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import {
  measurePageFill,
  UNMEASURED_PAGE_FILL,
  type PageFill,
} from "@/lib/cv/page-fill"

function sameFill(a: PageFill, b: PageFill): boolean {
  return a.measured === b.measured
    && a.fits === b.fits
    && a.pages === b.pages
    && a.pct === b.pct
}

/**
 * Page count of the sheet this ref wraps. `watch` changes when the CV, the
 * hidden lines, or the template change — a hidden sheet does not resize, so a
 * ResizeObserver on it would never see an edit.
 */
export function useMeasuredPageFill(
  ref: RefObject<HTMLElement | null>,
  watch: string,
): PageFill {
  const [fill, setFill] = useState<PageFill>(UNMEASURED_PAGE_FILL)
  const [settled, setSettled] = useState(false)
  const settledRef = useRef(false)

  useLayoutEffect(() => {
    const root = ref.current
    const sheet = root == null
      ? null
      : root.classList.contains("cvb-pdf-page")
        ? root
        : root.querySelector<HTMLElement>(".cvb-pdf-page")

    let cancelled = false
    const read = () => {
      if (cancelled) return
      const next = measurePageFill(sheet)
      setFill(prev => {
        if (!next.measured) return prev.measured ? prev : next
        return sameFill(prev, next) ? prev : next
      })
    }
    const markSettled = () => {
      if (cancelled || settledRef.current) return
      settledRef.current = true
      setSettled(true)
    }

    // A fallback font is taller than Geist. Counting pages before the sheet's
    // font has loaded offers "Fit to one page" for a CV that fits.
    const fonts = document.fonts
    if (fonts && fonts.status !== "loaded") {
      void fonts.ready.then(() => {
        read()
        markSettled()
      })
    } else {
      read()
      markSettled()
    }
    const frame = requestAnimationFrame(read)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [ref, watch])

  return settled ? fill : UNMEASURED_PAGE_FILL
}
