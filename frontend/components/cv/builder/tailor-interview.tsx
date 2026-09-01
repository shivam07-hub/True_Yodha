/**
 * One unproven JD ask — option picks plus a free-text line.
 */
"use client"

import { useState } from "react"
import type { WeaveQuestion } from "@/lib/api"
import { MentorThinking } from "./mentor-thinking"

function optionSentence(kind: "story" | "cv", label: string, detail: string): string {
  if (kind === "cv") return `It's on my CV already: "${label}"`
  return detail ? `That was my "${label}" work — ${detail}` : `That was my "${label}" work.`
}

interface TailorInterviewProps {
  question: WeaveQuestion
  index: number
  total: number
  banking: boolean
  skipLabel: string
  onSubmit: (text: string, final: boolean) => void
  onSkip: () => void
  probe: string | null
}

export function TailorInterview({
  question: q, index, total, banking, skipLabel, onSubmit, onSkip, probe,
}: TailorInterviewProps) {
  const [draft, setDraft] = useState("")
  const [picked, setPicked] = useState<Set<number>>(new Set())

  function composed(): string {
    const parts = Array.from(picked).sort((a, b) => a - b)
      .filter(i => q.options[i])
      .map(i => optionSentence(q.options[i].kind, q.options[i].label, q.options[i].detail))
    const free = draft.trim()
    if (free) parts.push(free)
    return parts.join(" ")
  }

  return (
    <div className="tw-int">
      <div className="tw-int-count mono">{index + 1} / {total}</div>
      <span className="tw-int-status" data-v={q.status}>
        {q.status === "weak" ? "Thin on your CV" : "Missing"}
      </span>
      <h2 className="tw-int-req">{q.requirement}</h2>
      {q.options.length > 0 && !probe && (
        <div className="tw-opts">
          <p className="tw-opts-label">Pick any that fit — Myro weaves them together. Add your own below.</p>
          {q.options.map((o, i) => (
            <button
              key={i} type="button" className="tw-opt"
              data-picked={picked.has(i)} aria-pressed={picked.has(i)}
              onClick={() => setPicked(prev => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })}
            >
              <span className="tw-opt-check" aria-hidden="true">{picked.has(i) ? "✓" : ""}</span>
              <span className="tw-opt-body">
                <span className="tw-opt-kind mono">{o.kind === "cv" ? "on your CV" : "your story"}</span>
                <span className="tw-opt-label">{o.label}</span>
                {o.detail && o.kind !== "cv" && <span className="tw-opt-detail">{o.detail}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {probe && <p className="tw-probe">{probe}</p>}
      <textarea
        className="tw-composer"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="In your words — what you did, and what came of it."
        rows={4}
      />
      <p className="tw-int-hint mono">Myro shapes your words — it never invents numbers.</p>
      <div className="tw-int-actions">
        <button
          type="button" className="tw-btn tw-btn-primary"
          disabled={(picked.size === 0 && draft.trim().length < 12) || banking}
          onClick={() => onSubmit(composed(), probe != null)}
        >
          {banking ? <MentorThinking size={16} /> : null}
          {probe ? "That's everything" : "That's it"}
        </button>
        <button type="button" className="tw-btn tw-btn-ghost" onClick={onSkip}>
          {skipLabel}
        </button>
      </div>
    </div>
  )
}
