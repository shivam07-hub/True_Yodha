"use client"

import Link from "next/link"
import type { GapSkill } from "@/lib/api"
import { buildScoreBreakdown } from "@/lib/score-breakdown"
import "./score-breakdown.css"

interface Props {
  score: number
  domainScores: Record<string, number>
  gapSkills: GapSkill[]
  id?: string
}

/**
 * Personal Myro Score breakdown (T2-3 Part A) — the credit-score answer to
 * "why is MY number this, and how do I move it." Reads the user's own score
 * decomposition: the evidenced domains it averages (each with its biggest real
 * lever, +N pts and a deep-link into Practice), and the uncounted domains as an
 * honest opportunity tier. Every point-gain is the real engine what-if; no
 * fabricated numbers (no-fab law). The generic method stays one tap behind.
 */
export function ScoreBreakdown({ score, domainScores, gapSkills, id }: Props) {
  const b = buildScoreBreakdown(score, domainScores, gapSkills)
  if (b.domains.length === 0) return null

  return (
    <section className="sb" id={id} aria-label="How your Myro Score is calculated">
      <p className="sb-lede">
        Your <strong>{score}</strong> is the average of the{" "}
        <strong>{b.evidencedCount}</strong> {b.evidencedCount === 1 ? "domain" : "domains"} your CV proves.
        {b.emptyCount > 0 && (
          <> {b.emptyCount} more {b.emptyCount === 1 ? "has" : "have"} no evidence yet — not counted.</>
        )}
      </p>

      <ol className="sb-domains" role="list">
        {b.domains.map((d) => (
          <li key={d.code} className="sb-row" data-band={d.band}>
            <div className="sb-row-head">
              <span className="sb-row-name">{d.label}</span>
              <span className="sb-row-score">{d.score}</span>
            </div>
            <div className="sb-bar" aria-hidden>
              <span className="sb-bar-fill" style={{ width: `${d.score}%` }} />
            </div>
            {d.lever && (
              <Link className="sb-lever" href={`/forge?skill=${encodeURIComponent(d.lever.skill)}`}>
                <span className="sb-lever-text">Level up {d.lever.skill}</span>
                <span className="sb-gain">+{d.lever.gain} pts</span>
              </Link>
            )}
          </li>
        ))}
      </ol>

      {b.emptyCount > 0 && (
        <div className="sb-empty">
          <span className="sb-empty-label">Uncounted domains</span>
          <p className="sb-empty-note">
            Covering one starts a new area. Build it past your average to lift the total.
          </p>
          <div className="sb-empty-chips">
            {b.emptyDomains.map((e) => (
              <span key={e.code} className="sb-chip">{e.label}</span>
            ))}
          </div>
          <Link className="sb-empty-cta" href="/cv">Add evidence to your CV →</Link>
        </div>
      )}

      <Link className="sb-method" href="/docs#scoring">See the full method →</Link>
    </section>
  )
}
