"use client"

import Link from "next/link"
import { tierForScore } from "@/lib/score-tiers"
import type { NextBestStep } from "@/lib/onboarding/next-best-steps"
import "./next-best-steps.css"

interface NextBestStepsProps {
  score: number
  steps: NextBestStep[]
}

/**
 * Post-score "Your next 3 steps" panel (issue #146) — the activation answer to
 * "I got my score and didn't know where to go." Each row is a whole-row link to
 * a named, score-derived move. Accent is rationed to the #1 (highest-impact)
 * lever and its CTA; ranks 2–3 stay quiet so the eye lands on the first move.
 */
export function NextBestSteps({ score, steps }: NextBestStepsProps) {
  if (steps.length === 0) return null
  const tier = tierForScore(score)

  return (
    <section className="nbs" aria-labelledby="nbs-title">
      <div className="nbs-head">
        <span className="nbs-eyebrow">Highest-leverage</span>
        <h2 id="nbs-title" className="nbs-title">Your next 3 steps</h2>
        <p className="nbs-lede">
          You scored <strong>{score}</strong> — {tier.label}.
          {tier.next !== null
            ? ` Here's the fastest way toward ${tier.next}.`
            : " Here's how to keep your edge."}
        </p>
      </div>

      <ol className="nbs-list" role="list">
        {steps.map((step) => (
          <li key={step.kind}>
            <Link
              href={step.href}
              className="nbs-row tm-control-focus"
              data-rank={step.rank}
              aria-label={`${step.title}. ${step.cta}.`}
            >
              <span className="nbs-rank" aria-hidden>{step.rank}</span>
              <span className="nbs-body">
                <span className="nbs-row-eyebrow">{step.eyebrow}</span>
                <span className="nbs-row-title">{step.title}</span>
                <span className="nbs-row-detail">{step.detail}</span>
              </span>
              <span className="nbs-cta" aria-hidden>
                {step.cta}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
