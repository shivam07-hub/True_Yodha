/**
 * MentorThinking — the real "Mentor is working" indicator (S2 mandate,
 * 2026-07-16): a woven-arc glyph that visibly breathes while an LLM thinks or
 * writes, replacing dead button-label spinners ("Shaping…").
 *
 * Two exports:
 *   <MentorThinking/>  — the glyph alone (drop beside any in-flight label)
 *   <WeaveLoom/>       — the full-stage state: glyph + narrated work lines that
 *                        tick off as the weave progresses. Narration cadence is
 *                        deterministic client pacing over ONE backend call — the
 *                        lines name real work (read JD → match stories → per-role
 *                        weave → number check), not theatre words.
 *
 * Compositor-only motion (transform/opacity); prefers-reduced-motion renders a
 * static glyph and plain lines. All colour from --tm-* tokens.
 */
"use client"

import { useEffect, useState } from "react"

export function MentorThinking({ size = 44 }: { size?: number }) {
  return (
    <span className="tw-think" style={{ width: size, height: size }} role="img" aria-label="Mentor is working">
      <svg viewBox="0 0 44 44" width={size} height={size} aria-hidden="true">
        <circle className="tw-think-core" cx="22" cy="22" r="3.2" fill="currentColor" />
        <g className="tw-think-arc tw-think-arc-a">
          <path d="M22 5 A17 17 0 0 1 39 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="tw-think-arc tw-think-arc-b">
          <path d="M22 33 A11 11 0 0 1 11 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
        </g>
      </svg>
    </span>
  )
}

interface WeaveLoomProps {
  /** The named work steps, in order. The last line holds until `settled`. */
  lines: string[]
  /** Flip when the backend call resolves — remaining lines complete quickly. */
  settled: boolean
  /** ms between line advances while in flight. */
  cadence?: number
}

export function WeaveLoom({ lines, settled, cadence = 1500 }: WeaveLoomProps) {
  const [reached, setReached] = useState(0)

  useEffect(() => {
    if (settled) { setReached(lines.length); return }
    if (reached >= lines.length - 1) return // hold on the last line until settled
    const t = setTimeout(() => setReached(r => Math.min(r + 1, lines.length - 1)), cadence)
    return () => clearTimeout(t)
  }, [reached, settled, lines.length, cadence])

  return (
    <div className="tw-loom" role="status" aria-live="polite">
      <MentorThinking size={48} />
      <ul className="tw-loom-lines">
        {lines.map((line, i) => {
          const state = i < reached ? "done" : i === reached && !settled ? "active" : settled ? "done" : "todo"
          return (
            <li key={line} className="tw-loom-line" data-state={state}>
              <span className="tw-loom-tick" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
              <span className="tw-loom-text">{line}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
