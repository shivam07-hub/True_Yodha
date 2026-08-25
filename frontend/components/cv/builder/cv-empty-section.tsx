/**
 * EmptySection — a section that has nothing in it, rendered as a hole rather
 * than omitted.
 *
 * Handoff §3: "Empty sections render as dashed placeholders with an `add ›`
 * affordance, not omitted." An omitted section is invisible, so a CV missing its
 * summary read as finished. The dashed frame carries the section's own severity
 * (a missing summary is blocking; a missing certification list is optional), so
 * the paper and the rail queue agree on cost without repeating the sentence.
 */
"use client"

import type { Severity } from "./cv-severity"

interface EmptySectionProps {
  copy: string
  severity: Severity
  /** Absent ⇒ the placeholder still renders, but this surface cannot fill it. */
  onAdd?: () => void
}

export function EmptySection({ copy, severity, onAdd }: EmptySectionProps) {
  if (!onAdd) {
    return (
      <div className="cvw-empty" data-sev={severity}>
        <span className="cvw-empty-copy">{copy}</span>
      </div>
    )
  }
  return (
    <button type="button" className="cvw-empty" data-sev={severity} onClick={onAdd}>
      <span className="cvw-empty-copy">{copy}</span>
      <span className="cvw-empty-add">add ›</span>
    </button>
  )
}
