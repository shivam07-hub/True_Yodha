/**
 * CvPaneToolbar — EDIT / SHEET, and the page-fill meter.
 *
 * Two changes from the old toolbar, both from handoff §3:
 *
 * · `Preview` was a tab button that read like a destination, so users treated
 *   the sheet as somewhere they went instead of the same CV in print form. It
 *   is a segmented EDIT / SHEET toggle now — one document, two renderings.
 * · the page-fill meter moves up here from the body. It is a fact about the
 *   whole document, so it belongs on the document's own chrome, not stacked
 *   above the first bullet where it competed with rank 2.
 */
"use client"

import type { PageFill } from "@/lib/cv/page-fill"
import { pageFillBand } from "@/lib/cv/page-fill"

interface CvPaneToolbarProps {
  mode: "edit" | "sheet"
  onMode: (mode: "edit" | "sheet") => void
  pageFill: PageFill
  lineCount: number
  wordCount: number
}

export function CvPaneToolbar({ mode, onMode, pageFill, lineCount, wordCount }: CvPaneToolbarProps) {
  const band = pageFillBand(pageFill)
  const pages = pageFill.fits
    ? "one page"
    : `${pageFill.pages} pages`
  return (
    <div className="cvw-toolbar">
      <div className="cvw-seg" role="group" aria-label="How to view your CV">
        <button
          type="button"
          className="cvw-seg-btn"
          aria-pressed={mode === "edit"}
          onClick={() => onMode("edit")}
        >Edit</button>
        <button
          type="button"
          className="cvw-seg-btn"
          aria-pressed={mode === "sheet"}
          onClick={() => onMode("sheet")}
        >Sheet</button>
      </div>

      <div className="cvw-fill" data-band={band}>
        <span className="cvw-fill-stats">
          {lineCount} lines · ~{wordCount} words · {pages} · {pageFill.pct}%
        </span>
        <span
          className="cvw-fill-bar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, pageFill.pct)}
          aria-label="How much of one page this CV fills"
        >
          <span style={{ width: `${Math.min(100, pageFill.pct)}%` }} />
        </span>
      </div>
    </div>
  )
}
