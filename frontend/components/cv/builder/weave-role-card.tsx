/**
 * WeaveRoleCard — one role's proposed rework. Proposed lines lead; a quiet
 * `original` puts the old line back without a settings segment on every bullet.
 */
"use client"

import { useState } from "react"
import type { WeaveRole } from "@/lib/api"

export function WeaveRoleCard({
  role, originalIndexes, onToggleOriginal,
}: {
  role: WeaveRole
  originalIndexes: Set<number>
  onToggleOriginal: (i: number) => void
}) {
  const [wasOpen, setWasOpen] = useState<number | null>(null)

  return (
    <div className="tw-role">
      <div className="tw-role-head">
        <span className="tw-role-title">{role.role || "Role"}</span>
        <span className="tw-role-co">{role.company}</span>
      </div>
      {role.why && <p className="tw-role-why">{role.why}</p>}

      <ul className="tw-role-lines">
        {role.bullets.map((b, i) => {
          const useOriginal = originalIndexes.has(i)
          const originalText = b.from_lines.filter(Boolean).join(" ")
          const shown = useOriginal && originalText ? originalText : b.text
          return (
            <li key={i} className="tw-role-line">
              <span className="tw-role-mark" aria-hidden="true">◆</span>
              <div className="tw-role-linebody">
                <p className="tw-role-text">{shown}</p>
                <div className="tw-prov">
                  {b.from_lines.length > 0 && (
                    <button
                      type="button"
                      className="tw-prov-chip tw-prov-was"
                      aria-expanded={wasOpen === i}
                      onClick={() => setWasOpen(wasOpen === i ? null : i)}
                    >
                      was {b.from_lines.length === 1 ? "1 line" : `${b.from_lines.length} lines`} ▸
                    </button>
                  )}
                  {b.story_titles.map(t => (
                    <span key={t} className="tw-prov-chip">your story · {t}</span>
                  ))}
                  {b.used_answer && <span className="tw-prov-chip tw-prov-answer">your answer</span>}
                  {originalText && (
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
                    {b.from_lines.map(line => <li key={line}>{line}</li>)}
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
            {role.dropped_lines.map(line => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
