"use client"

import Link from "next/link"
import type { GapSkill } from "@/lib/api"
import { buildScoreBreakdown } from "@/lib/score-breakdown"
import "./score-breakdown.css"

/**
 * Cap on rendered "uncounted domain" chips (default variant only). The real
 * 31-domain universe means this tier can run to ~20+ names for a fresh CV —
 * too many for a compact rail (/market command-rail is explicitly compact).
 * Capped, never silently: the remainder shows as a real count, not omitted.
 */
const EMPTY_DOMAIN_CAP = 8

interface Props {
  score: number
  domainScores: Record<string, number>
  gapSkills: GapSkill[]
  id?: string
  /**
   * "default" — the standalone decomposition (/forge, /market): lede, per-domain
   * levers, uncounted tier, method link. The only place that sentence appears.
   *
   * "selector" — the SAME bars acting as the domain picker on /skills, where the
   * radar + focus panel already own the lede and the single lever. Each row
   * becomes a button that reports its domain; the lede, levers, and uncounted
   * tier are dropped so the list is one job (pick a domain) instead of ten
   * competing CTAs. `onSelectDomain` receives the raw domain KEY (the
   * domain_scores key the radar and focus panel index on), never the label.
   */
  variant?: "default" | "selector"
  onSelectDomain?: (domain: string) => void
  /** Raw domain key of the currently-selected axis (selector variant). */
  activeDomain?: string | null
}

export function ScoreBreakdown({
  score,
  domainScores,
  gapSkills,
  id,
  variant = "default",
  onSelectDomain,
  activeDomain,
}: Props) {
  const b = buildScoreBreakdown(score, domainScores, gapSkills)
  if (b.domains.length === 0) return null

  const isSelector = variant === "selector"

  return (
    <section
      className={isSelector ? "sb sb--selector" : "sb"}
      id={id}
      aria-label={isSelector ? "Pick a domain to inspect" : "How your Myro Score is calculated"}
    >
      {!isSelector && (
        <p className="sb-lede">
          Your <strong>{score}</strong> is the average of the{" "}
          <strong>{b.evidencedCount}</strong> {b.evidencedCount === 1 ? "domain" : "domains"} your CV proves.
          {b.emptyCount > 0 && (
            <> {b.emptyCount} more {b.emptyCount === 1 ? "has" : "have"} no evidence yet — not counted.</>
          )}
        </p>
      )}

      <ol className="sb-domains" role="list">
        {b.domains.map((d) => {
          const rowInner = (
            <>
              <div className="sb-row-head">
                <span className="sb-row-name">{d.label}</span>
                <span className="sb-row-score">{d.score}</span>
              </div>
              <div className="sb-bar" aria-hidden>
                <span className="sb-bar-fill" style={{ width: `${d.score}%` }} />
              </div>
            </>
          )
          return (
            <li key={d.code} className="sb-row" data-band={d.band}>
              {isSelector ? (
                <button
                  type="button"
                  className={`sb-row-select tm-control-focus${d.code === activeDomain ? " is-active" : ""}`}
                  aria-pressed={d.code === activeDomain}
                  onClick={() => onSelectDomain?.(d.code)}
                >
                  {rowInner}
                </button>
              ) : (
                <>
                  {rowInner}
                  {d.lever && (
                    <Link className="sb-lever" href={`/forge?skill=${encodeURIComponent(d.lever.skill)}`}>
                      <span className="sb-lever-text">Level up {d.lever.skill}</span>
                      <span className="sb-gain">+{d.lever.gain} pts</span>
                    </Link>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>

      {!isSelector && b.emptyCount > 0 && (
        <div className="sb-empty">
          <span className="sb-empty-label">Uncounted domains</span>
          <p className="sb-empty-note">
            Covering one starts a new area. Build it past your average to lift the total.
          </p>
          <div className="sb-empty-chips">
            {b.emptyDomains.slice(0, EMPTY_DOMAIN_CAP).map((e) => (
              <span key={e.code} className="sb-chip">{e.label}</span>
            ))}
            {b.emptyDomains.length > EMPTY_DOMAIN_CAP && (
              <span className="sb-chip sb-chip-more">
                +{b.emptyDomains.length - EMPTY_DOMAIN_CAP} more
              </span>
            )}
          </div>
          <Link className="sb-empty-cta" href="/cv">Add evidence to your CV →</Link>
        </div>
      )}

      {!isSelector && (
        <Link className="sb-method" href="/docs#scoring">See the full method →</Link>
      )}
    </section>
  )
}
