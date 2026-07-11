"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  jobs as jobsApi,
  type JobMatch,
  type SkillGapItem,
  type SkillGapResponse,
} from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { MAX_LEVEL } from "@/lib/level-thresholds"
import { useSkillUpvotes } from "@/lib/hooks/use-skill-upvotes"
import { LensWhy, jdSnippet, stripTaxonomySuffix } from "./lenses"
import { CommentThread } from "@/components/comments/comment-thread"
import { CompanyDrawer } from "@/components/companies/company-drawer"
import { ReachSection } from "./reach-section"
import type { OtherRole } from "./lens-company"

/** Skills + "Why you fit" fetch only when the detail is open (expand-gated XP). */
export function useSkillGap(job: JobMatch, token: string, active: boolean) {
  const { data, isLoading } = useQuery<SkillGapResponse>({
    queryKey: dataKeys.skillGap(job.job_id),
    queryFn: () => jobsApi.skillGap(token, job.job_id),
    enabled: !!token && !!job.job_id && active,
    staleTime: 10 * 60 * 1000,
  })
  return { skills: data?.skills ?? [], loadingSkills: isLoading }
}

/* ── One skill row: name · L0→L2 · 5 dots · upvote ────────────────
   The upvote is the row's ONE action — "I want to learn this" — counted
   per job, so ▲3 literally means "3 of my jobs need this". Feeds Forge
   ordering; the fill is optimistic (lands on tap, before the network). */
function SkillRow({
  skill,
  target,
  upvoted,
  count,
  onUpvote,
}: {
  skill: SkillGapItem
  target: number
  upvoted: boolean
  count: number
  onUpvote: () => void
}) {
  const [pop, setPop] = React.useState(false)
  const level = Math.max(0, Math.min(MAX_LEVEL, Math.round(skill.user_level ?? 0)))
  const tgt = Math.min(MAX_LEVEL, target)
  return (
    <div className="db-skillrow">
      <span className="sname">{stripTaxonomySuffix(skill.skill)}</span>
      <span className="slvl">{level >= tgt ? `L${level}` : `L${level}→L${tgt}`}</span>
      <span className="db-dots" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i < level ? "on" : ""} />
        ))}
      </span>
      <button
        type="button"
        className={`db-upvote${upvoted ? " on" : ""}${pop ? " db-just-upvoted" : ""}`}
        onClick={() => {
          if (!upvoted) {
            setPop(true)
            window.setTimeout(() => setPop(false), 300)
          }
          onUpvote()
        }}
        aria-pressed={upvoted}
        aria-label={`Upvote ${stripTaxonomySuffix(skill.skill)} to practice`}
        title={count > 0 ? `Upvoted from ${count} of your jobs — ranks it in Practice` : "Upvote to practice first"}
      >
        <span aria-hidden>▲</span>
        {count > 0 ? <span className="n">{count}</span> : null}
      </button>
    </div>
  )
}

export interface DetailBodyProps {
  job: JobMatch
  token: string
  active: boolean
  cartSkillNames: Set<string>
  otherRoles: OtherRole[]
  onSkillToggle: (s: SkillGapItem) => void
  onJump?: (jobId: string) => void
}

export function DetailBody(p: DetailBodyProps) {
  const { skills, loadingSkills } = useSkillGap(p.job, p.token, p.active)
  const upvotes = useSkillUpvotes(p.token)
  const [drawerOpen, setDrawerOpen] = React.useState(false)

  const matched = skills.filter((s) => (s.user_level ?? 0) > 0).slice(0, 6)
  const build = skills.filter((s) => (s.user_level ?? 0) === 0).slice(0, 6)
  const company = p.job.company
  const rowProps = (s: SkillGapItem) => ({
    upvoted: upvotes.upvotedFor(s.skill, p.job.job_id),
    count: upvotes.countFor(s.skill),
    onUpvote: () =>
      upvotes.toggle({ skill_key: s.skill, display_name: stripTaxonomySuffix(s.skill) }, p.job.job_id),
  })

  return (
    <div className="db-detail">
      {/* WHY YOU FIT — keeps the existing XP-gated streaming model. */}
      <div className="db-dsec">
        <LensWhy
          job={p.job}
          skills={skills}
          loadingSkills={loadingSkills}
          token={p.token}
          active={p.active}
          cartSkillNames={p.cartSkillNames}
          onSkillToggle={p.onSkillToggle}
        />
      </div>

      {/* SKILLS — you already match · skills to build. No data → no section:
          the drawer never announces its own gaps (design-over-words). */}
      {matched.length > 0 || build.length > 0 || loadingSkills ? (
      <div className="db-dsec">
        {matched.length > 0 ? (
          <>
            <div className="db-dsec-head">
              <span className="db-label">You already match · {matched.length}</span>
            </div>
            {matched.map((s) => {
              const cur = Math.max(0, Math.round(s.user_level ?? 0))
              return <SkillRow key={s.skill} skill={s} target={cur + 1} {...rowProps(s)} />
            })}
          </>
        ) : null}
        {build.length > 0 ? (
          <>
            <div className="db-dsec-head" style={{ marginTop: matched.length ? 8 : 0 }}>
              <span className="db-label">Skills to build · {build.length}</span>
            </div>
            {build.map((s) => (
              <SkillRow key={s.skill} skill={s} target={s.required_level ?? 1} {...rowProps(s)} />
            ))}
          </>
        ) : null}
        {loadingSkills && skills.length === 0 ? <p className="db-lens-empty">Loading skills…</p> : null}
      </div>
      ) : null}

      {/* REACH THE PEOPLE — free searches + paid outreach pack (backlog #35) */}
      <ReachSection job={p.job} token={p.token} active={p.active} />

      {/* JOB DESCRIPTION */}
      {p.job.job_description ? (
        <div className="db-dsec">
          <span className="db-label">Job description</span>
          <pre className="db-jdbox">{p.job.job_description}</pre>
        </div>
      ) : null}

      {/* COMPANY + other open roles */}
      <div className="db-dsec">
        <div className="db-dsec-head">
          <span className="db-label">Company</span>
          {company ? (
            <button type="button" className="db-mini-btn" onClick={() => setDrawerOpen(true)}>
              Company report →
            </button>
          ) : null}
        </div>
        {p.otherRoles.length > 0 ? (
          <>
            <span className="db-label">More roles</span>
            {p.otherRoles.slice(0, 4).map((o) => (
              <button key={o.jobId} type="button" className="db-otherrole" onClick={() => p.onJump?.(o.jobId)}>
                <span>{o.role}</span>
                <span className="fit">{o.fit != null ? `${o.fit}% fit` : "★"}</span>
              </button>
            ))}
          </>
        ) : null}
      </div>

      {/* NOTES — public community feed on this posting */}
      <div className="db-dsec">
        <span className="db-label">Notes · what applicants say</span>
        <CommentThread
          token={p.token}
          entityType="job"
          entityId={p.job.job_id}
          placeholder={`Leave a note for future applicants to ${company ?? "this role"}…`}
        />
      </div>

      {company ? <CompanyDrawer company={company} open={drawerOpen} onClose={() => setDrawerOpen(false)} /> : null}
    </div>
  )
}

/* Re-export the snippet helper for the collapsed cards. */
export { jdSnippet }
