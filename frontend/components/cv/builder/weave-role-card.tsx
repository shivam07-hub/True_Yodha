/**
 * WeaveRoleCard — one role's proposed rework in the per-role accept stepper
 * (grill lock L2: 4-5 decisions, not 15). Proposed lines lead (value first);
 * provenance sits under each line as quiet chips — which of YOUR lines it was
 * reworked from, which banked story it drew on, whether your interview answer
 * landed. Dropped lines are shown struck, never silently gone (accounting is
 * a backend invariant; this card makes it visible).
 */
"use client"

import { useState } from "react"
import type { WeaveRole } from "@/lib/api"

export function WeaveRoleCard({ role }: { role: WeaveRole }) {
  const [wasOpen, setWasOpen] = useState<number | null>(null)

  return (
    <div className="tw-role">
      <div className="tw-role-head">
        <span className="tw-role-title">{role.role || "Role"}</span>
        <span className="tw-role-co">{role.company}</span>
      </div>
      {role.why && <p className="tw-role-why">{role.why}</p>}

      <ul className="tw-role-lines">
        {role.bullets.map((b, i) => (
          <li key={i} className="tw-role-line">
            <span className="tw-role-mark" aria-hidden="true">◆</span>
            <div className="tw-role-linebody">
              <p className="tw-role-text">{b.text}</p>
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
              </div>
              {wasOpen === i && b.from_lines.length > 0 && (
                <ul className="tw-was-list">
                  {b.from_lines.map(line => <li key={line}>{line}</li>)}
                </ul>
              )}
            </div>
          </li>
        ))}
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
