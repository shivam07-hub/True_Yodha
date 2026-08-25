/**
 * CvLineFix — the accent-ringed card under a CV line, in two phases.
 *
 *   brief    free, instant, no network. Why the line is flagged, and an authored
 *            example of the same defect fixed.
 *   rewrite  the Mentor call — mounted ONLY after the user asks for it.
 *
 * The phase split is the whole point, and it is structural rather than a flag:
 * `CvLineRewrite` owns the fetch in a mount effect, so while it is unmounted no
 * request can exist. Opening a line, jumping to it from the rail, re-rendering
 * the pane, or the autosave draft changing under it cannot start an LLM — only
 * pressing the button can, and the button unmounts itself when pressed, so a
 * double-tap cannot fire twice.
 *
 * That replaces the previous arrangement, where opening the card WAS the
 * request: the model started on a click whose visible label was "fix ›".
 */
"use client"

import { useState } from "react"
import { CvFixBrief } from "./cv-fix-brief"
import { CvLineRewrite } from "./cv-line-rewrite"
import type { V2Fix } from "./fix-model"
import type { IssueBrief } from "./issue-model"
import type { RewriteFetcher } from "./use-line-rewrite"

interface CvLineFixProps {
  fix: V2Fix
  brief: IssueBrief
  makeFetcher: (bullet: string, fix: V2Fix) => RewriteFetcher
  bullet: string
  applying?: boolean
  onApply: (text: string) => void
  onEdit: () => void
  onDismiss?: () => void
  onDiscard: () => void
}

export function CvLineFix({
  fix, brief, makeFetcher, bullet, applying, onApply, onEdit, onDismiss, onDiscard,
}: CvLineFixProps) {
  const [asked, setAsked] = useState(false)

  if (!asked) {
    return (
      <div className="cvw-rw" data-phase="brief">
        <div className="cvw-rw-head">
          <span className="cvw-rw-label">what&rsquo;s wrong</span>
          <span className="cvw-rw-count">{fix.severity}</span>
        </div>
        <CvFixBrief
          brief={brief}
          severity={fix.severity}
          onRewrite={() => setAsked(true)}
          onEdit={onEdit}
          onDismiss={onDismiss}
        />
      </div>
    )
  }

  return (
    <CvLineRewrite
      fetcher={makeFetcher(bullet, fix)}
      fix={fix}
      applying={applying}
      quantifyOnly={fix.kind === "Quantify"}
      onApply={onApply}
      onDiscard={onDiscard}
    />
  )
}
