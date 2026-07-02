"use client"

import Link from "next/link"
import type { NextBestStep } from "@/lib/onboarding/next-best-steps"
import "./compact-moves.css"

/**
 * Rail-compact "Your next moves" — the score-improvement triad (1 skill · 1 job ·
 * 1 CV) sized for the narrow first-drop rail on /market. Each row is a whole-row
 * link with a ≤3-word label + one metric chip (skill gain "+6" / job fit "21%").
 * Accent is rationed to move 1; 2–3 stay quiet. The verbose variant (eyebrow +
 * detail) lives on the /forge score screen — this is the glance, that's the detail.
 */
export function CompactMoves({ steps }: { steps: NextBestStep[] }) {
  if (steps.length === 0) return null

  return (
    <nav className="cmv" aria-label="Your next moves">
      <p className="cmv-head">Your next moves</p>
      <ol className="cmv-list" role="list">
        {steps.map((step) => (
          <li key={step.kind}>
            <Link
              href={step.href}
              className="cmv-row tm-control-focus"
              data-rank={step.rank}
              aria-label={`${step.short}.${step.metric ? ` ${step.metric}.` : ""} ${step.cta}.`}
            >
              <span className="cmv-rank" aria-hidden>{step.rank}</span>
              <span className="cmv-label" title={step.short}>{step.short}</span>
              {step.metric ? <span className="cmv-metric" aria-hidden>{step.metric}</span> : null}
              <svg className="cmv-arrow" aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
