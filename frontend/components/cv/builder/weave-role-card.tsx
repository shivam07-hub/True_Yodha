/**
 * WeaveRoleCard — one role's proposed rework. Proposed lines lead; a quiet
 * `original` puts the old line back without a settings segment on every bullet.
 */
"use client"

import { useState } from "react"
import type { WeaveRole } from "@/lib/api"

/** The lines this pointer shows: the originals when flipped back, else null.
 *  Pure — not a hook, despite sitting beside one. */
function originalLinesFor(
  originalIndexes: Set<number>, i: number, sources: string[],
): string[] | null {
  return originalIndexes.has(i) && sources.length > 0 ? sources : null
}

export function WeaveRoleCard({
  role, originalIndexes, onToggleOriginal,
}: {
  role: WeaveRole
  originalIndexes: Set<number>
  onToggleOriginal: (i: number) => void
}) {
  const [wasOpen, setWasOpen] = useState<number | null>(null)
  const dropped = role.dropped_lines.length

  return (
    <div className="tw-role">
      <div className="tw-role-head">
        <span className="tw-role-title">{role.role || "Role"}</span>
        <span className="tw-role-co">{role.company}</span>
      </div>
      {role.edit_kind === "trim" ? (
        // A trim reworded nothing. Saying so is the only honest caption — the
        // model's rework rationale would be describing work it did not do.
        <p className="tw-role-why">
          Nothing reworded. {dropped === 1 ? "One line" : `${dropped} lines`} left out for this job.
        </p>
      ) : role.why ? (
        <p className="tw-role-why">{role.why}</p>
      ) : null}

      <ul className="tw-role-lines">
        {role.bullets.map((b, i) => {
          const sources = b.from_lines.filter(Boolean)
          // A merged line goes back to the LINES it merged, not to one glued
          // sentence — so the preview shows them the way a Take would write them.
          const shown = originalLinesFor(originalIndexes, i, sources) ?? [b.text]
          const useOriginal = originalIndexes.has(i)
          // A line that came back verbatim has no provenance worth showing: the
          // "was" and "original" controls would both resolve to itself.
          const verbatim = sources.length === 1 && sources[0] === b.text
          return (
            <li key={i} className="tw-role-line">
              <span className="tw-role-mark" aria-hidden="true">◆</span>
              <div className="tw-role-linebody">
                {shown.map((line, n) => (
                  <p key={n} className="tw-role-text">{line}</p>
                ))}
                <div className="tw-prov">
                  {b.from_lines.length > 0 && !verbatim && (
                    <button
                      type="button"
                      className="tw-prov-chip tw-prov-was"
                      aria-expanded={wasOpen === i}
                      onClick={() => setWasOpen(wasOpen === i ? null : i)}
                    >
                      was {b.from_lines.length === 1 ? "1 line" : `${b.from_lines.length} lines`} ▸
                    </button>
                  )}
                  {b.story_titles.map((t, n) => (
                    <span key={`${t}-${n}`} className="tw-prov-chip">your story · {t}</span>
                  ))}
                  {b.used_answer && <span className="tw-prov-chip tw-prov-answer">your answer</span>}
                  {sources.length > 0 && !verbatim && (
                    <button
                      type="button"
                      className="tw-lineact"
                      aria-pressed={useOriginal}
                      onClick={() => onToggleOriginal(i)}
                    >original</button>
                  )}
                </div>
                {wasOpen === i && b.from_lines.length > 0 && (
                  <ul className="tw-was-list">
                    {b.from_lines.map((line, n) => <li key={n}>{line}</li>)}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {role.dropped_lines.length > 0 && (
        <div className="tw-dropped">
          <span className="tw-dropped-label">Left out</span>
          <ul>
            {role.dropped_lines.map((line, n) => <li key={n}>{line}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
