/**
 * Restore lines that left the paper. The count is the control; the list is
 * the restore surface. No struck ghosts on the document.
 */
"use client"

import { useState } from "react"
import type { HiddenLine } from "@/lib/cv/hidden-lines"

export function CvHiddenChrome({
  lines, onShow,
}: {
  lines: HiddenLine[]
  onShow: (iid: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (lines.length === 0) return null
  const n = lines.length
  return (
    <div className="cvw-hidden-chrome">
      <button
        type="button"
        className="cvw-hidden-count"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {n} hidden
      </button>
      {open && (
        <ul className="cvw-hidden-list">
          {lines.map(line => (
            <li key={line.iid}>
              <span className="cvw-hidden-text">{line.text}</span>
              <button type="button" className="cvw-lineact" onClick={() => onShow(line.iid)}>
                show
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
