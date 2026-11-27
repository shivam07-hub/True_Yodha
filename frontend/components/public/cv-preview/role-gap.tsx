"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import type { AnonTarget, CVStructured } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { flaggedLines } from "./flagged-lines"
import { SectionTitle } from "@/components/public/landing/section-title"
import { roleLabel } from "@/components/public/landing/role-match"
import { LEVEL_LABEL, skillLabel } from "@/components/public/landing/role-picker"
import "@/components/public/landing/landing-base.css"
import "@/components/public/landing/landing-chapters.css"
import "@/components/public/landing/landing-gap.css"
import "./role-gap.css"

interface RoleGapProps {
  target: AnonTarget
  cv: CVStructured
  /** Open the jobs: sign-up, since tailoring starts there (spec #66 Q9). */
  onJobs: () => void
  /** Open the playground on this CV. */
  onFix: () => void
}

function SkillList({ skills }: { skills: string[] }) {
  return <>{skills.length ? skills.map(skillLabel).join(" · ") : "—"}</>
}

/**
 * Spec #66 L7 (Q8): the first screen after an upload that carried a landing
 * pick. Chapter 4's three rows, now read from this CV: the role's skills it
 * shows, the lines the playground would rewrite, the skills it lacks. Above
 * them the visitor's own number: live jobs at that level naming two or more of
 * their skills. Seeing the jobs asks for an account; fixing the CV does not.
 */
export function RoleGap({ target, cv, onJobs, onFix }: RoleGapProps) {
  const rewrite = useMemo(() => flaggedLines(cv), [cv])
  const label = [roleLabel(target.family), target.band ? LEVEL_LABEL[target.band] : null].filter(Boolean).join(" · ")
  const reach = target.within_reach
  const jobsLabel = `See ${formatCount(reach)} ${reach === 1 ? "job" : "jobs"}`

  return (
    <section className="lp-chapter cvg" aria-label="Your gap">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <SectionTitle as="h1">Your CV vs {label}</SectionTitle>
        </div>

        {target.jobs > 0 ? (
          <div className="cvg-reach">
            <p className="cvg-reach-line">
              <span className="cvg-reach-num">{formatCount(reach)}</span> {reach === 1 ? "job" : "jobs"} within reach today
            </p>
            <p className="lp-chapter-meta">
              of {formatCount(target.jobs)} open · each names 2+ of your skills
            </p>
          </div>
        ) : null}

        <dl className="lp-gap">
          <div className="lp-gap-row" data-kind="matched">
            <dt>Matched</dt>
            <dd><SkillList skills={target.matched} /></dd>
          </div>
          <div className="lp-gap-row" data-kind="rewrite">
            <dt>Rewrite</dt>
            <dd>
              {rewrite ? (
                <>
                  <q className="cvg-line">{rewrite.first}</q>
                  {rewrite.more > 0 ? <span className="cvg-more">+{rewrite.more} more</span> : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="lp-gap-row" data-kind="missing">
            <dt>Missing</dt>
            <dd><SkillList skills={target.missing} /></dd>
          </div>
        </dl>

        <div className="lp-chapter-action cvg-actions">
          {reach > 0 ? <Button onClick={onJobs}>{jobsLabel}</Button> : null}
          <Button variant={reach > 0 ? "outline" : "solid"} onClick={onFix}>
            Fix my CV
          </Button>
        </div>
      </div>
    </section>
  )
}
