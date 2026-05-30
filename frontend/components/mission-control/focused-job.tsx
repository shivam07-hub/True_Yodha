"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Icon } from "./icons"
import { jobs, type ApplicationStatus, type JobMatch, type SkillGapItem, type SkillGapResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { APPLICATION_STAGES, APPLICATION_OUTCOMES } from "@/lib/api"
import { MAX_LEVEL, sessionsForGap } from "@/lib/level-thresholds"
import { ApplyRow } from "@/components/jobs/apply-row"
import { CompanyDrawer } from "@/components/companies/company-drawer"
import { stripMarkdown } from "@/lib/text/strip-markdown"
import { ForgeChip, type ForgeChipState } from "@/components/skills/forge-chip"
import { JobShareButton } from "./job-share-button"
import { useForgeTimerStore } from "@/store/forgeTimerStore"
import { useStreamingText, type StreamEvent } from "@/lib/hooks/use-streaming-text"
import { useXPGate } from "@/lib/hooks/use-xp-gate"
import { useXPStore } from "@/store/xpStore"
import { XP_POLICY } from "@/lib/xp-policy"

function stripTaxonomySuffix(s: string): string {
  return s.replace(/\s*\((Programming Language|Software|Framework|Library)\)\s*$/i, "")
}

interface FocusedJobProps {
  job: JobMatch
  status: ApplicationStatus
  token: string
  isNew: boolean
  cycleIndex: number
  cartSkillNames: Set<string>
  onStatus: (s: ApplicationStatus) => void
  onSkillToggle: (skill: SkillGapItem) => void
}

const STAGE_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  final_round: "Final Round",
  ghosted: "Ghosted",
  rejected: "Rejected",
  offer: "Offer 🎉",
  withdrew: "Withdrew",
}

export const FocusedJob = React.forwardRef<HTMLDivElement, FocusedJobProps>(function FocusedJob(
  { job, status, token, isNew, cycleIndex, cartSkillNames, onStatus, onSkillToggle },
  ref,
) {
  const fit = Math.max(0, Math.min(100, Math.round(job.overlap_score)))
  const { data: skillGapData } = useQuery<SkillGapResponse>({
    queryKey: dataKeys.skillGap(job.job_id),
    queryFn: () => jobs.skillGap(token, job.job_id),
    enabled: !!token && !!job.job_id,
    staleTime: 10 * 60 * 1000,
  })

  const skills = skillGapData?.skills ?? []
  const matchedSkills = skills.filter((s) => (s.user_level ?? 0) > 0)
  const matchedDisplay = matchedSkills.slice(0, 2)
  const buildSkills = skills.filter((s) => (s.user_level ?? 0) === 0).slice(0, 4)
  const [companyDrawerOpen, setCompanyDrawerOpen] = React.useState(false)
  const activeForgeSkill = useForgeTimerStore(s => s.skillName)
  const sessionActive = useForgeTimerStore(s => s.sessionActive)
  const totalCartSkills = cartSkillNames.size

  return (
    <div className="mc-focus-row" ref={ref}>
      <div className={`mc-focus-card${isNew ? " is-new" : ""}`} data-cycle={cycleIndex}>
        <JobShareButton company={job.company} />
        <div className="mc-focus-head">
          <div style={{ minWidth: 0 }}>
            <div className="mc-focus-eyebrow">
              Focused on:{" "}
              {job.company ? (
                <button
                  type="button"
                  onClick={() => setCompanyDrawerOpen(true)}
                  className="strong"
                  style={{
                    color: "var(--tm-text)", textDecoration: "underline", textDecorationStyle: "dotted",
                    textUnderlineOffset: 3, background: "transparent", border: "none",
                    padding: 0, font: "inherit", letterSpacing: "inherit", textTransform: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {job.company}
                </button>
              ) : (
                <span className="strong">—</span>
              )}
            </div>
            <h2
              className="mc-focus-title"
              role="button"
              tabIndex={0}
              title="Tap to copy job title"
              onClick={() => navigator.clipboard?.writeText(job.title ?? "").catch(() => {})}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  navigator.clipboard?.writeText(job.title ?? "").catch(() => {})
                }
              }}
              style={{ cursor: "copy" }}
            >
              {job.title}
            </h2>
            <div className="mc-focus-sub">
              <span>
                {[job.company, job.location].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <ApplyRow company={job.company} title={job.title} jobId={job.job_id} variant="compact" />
            </div>
          </div>
          <div className="mc-focus-fit">
            <div className="num">{fit}</div>
            <div className="lbl">Fit</div>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <select
            aria-label="Application status"
            value={status}
            onChange={(e) => onStatus(e.target.value as ApplicationStatus)}
            className="mc-status-select tm-control-focus"
            style={{ ["--mc-bar-w" as never]: `${fit}%` }}
          >
            <optgroup label="Progress">
              {APPLICATION_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Outcome">
              {APPLICATION_OUTCOMES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {matchedDisplay.length > 0 ? (
          <div className="mc-skill-rows">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {matchedDisplay.map((s) => (
                <span className="mc-skill-pill matched" key={s.skill}>
                  ✓ {stripTaxonomySuffix(s.skill)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <Link className="mc-cta-tailor" href={`/cv?jobId=${job.job_id}`}>
          <Icon name="arrowRight" size={14} />
          Tailor CV for this role
        </Link>

        <hr className="mc-focus-sep" />

        <section>
          <div className="mc-fit-block-head">
            <span className="label">Why this is a good fit</span>
            <span className="mc-tag-pill">LLM</span>
          </div>
          <FitRationale token={token} jobId={job.job_id} cached={job.llm_explanation} />
        </section>

        {matchedSkills.length > 0 ? (
          <>
            <hr className="mc-focus-sep" />
            <section>
              <div className="mc-fit-block-head">
                <span className="label">Skills you already match</span>
                <span className="mc-count-bub">{matchedSkills.length}</span>
              </div>
              <div className="mc-skill-match-grid">
                {matchedSkills.slice(0, 8).map((s) => {
                  const current = Math.max(0, Math.round(s.user_level ?? 0))
                  const target = Math.min(MAX_LEVEL, current + 1)
                  return (
                    <SkillMatchRow
                      key={s.skill}
                      skill={s}
                      inCart={cartSkillNames.has(s.skill)}
                      onDominate={() => onSkillToggle({ ...s, user_level: current, required_level: target, missing: true })}
                    />
                  )
                })}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <aside className="mc-side-card">
        <div className="head">
          <span className="lbl">Skills to build</span>
          <span className="mc-count-bub">{buildSkills.length}</span>
        </div>
        {buildSkills.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
            {skillGapData === undefined ? "Loading…" : "Nothing to build — you cover this role."}
          </div>
        ) : (
          buildSkills.map((s) => {
            const inCart = cartSkillNames.has(s.skill)
            const fromLvl = s.user_level ?? 0
            const toLvl = s.required_level ?? 1
            const sessions = sessionsForGap(fromLvl, toLvl)
            const activeSkillLower = activeForgeSkill?.toLowerCase()
            const isForging = sessionActive && activeSkillLower === s.skill.toLowerCase()
            const state: ForgeChipState = isForging ? "active" : inCart ? "cart" : "idle"
            return (
              <div className="mc-skill-build-row" key={s.skill}>
                <div className="name">{stripTaxonomySuffix(s.skill)}</div>
                <div className="meta">
                  <span className="lvl">L{fromLvl}→L{toLvl}</span>
                  <ForgeChip
                    skillName={s.skill}
                    level={fromLvl}
                    sessionsToNext={sessions}
                    state={state}
                    onClick={() => onSkillToggle(s)}
                  />
                </div>
              </div>
            )
          })
        )}

      </aside>

      {totalCartSkills > 0 && (
        <Link href="/forge" className="mc-forge-cart-footer">
          <span className="lhs">
            <span className="dot" aria-hidden />
            <span className="lbl">
              <strong>{totalCartSkills}</strong> skill{totalCartSkills === 1 ? "" : "s"} locked
            </span>
          </span>
          <span className="rhs">
            Open Forge <Icon name="arrowRight" size={12} />
          </span>
        </Link>
      )}

      {job.company && (
        <CompanyDrawer
          company={job.company}
          open={companyDrawerOpen}
          onClose={() => setCompanyDrawerOpen(false)}
        />
      )}
    </div>
  )
})

interface FitRationaleProps {
  token: string
  jobId: string
  cached: string | null | undefined
}

/**
 * "Why this is a good fit" rationale.
 * - Cached (already analysed) → static text.
 * - Funded + un-analysed → auto-stream tokens on mount (Claude-style reveal),
 *   charge 10 XP on success (server-side), nudge fires off the XP pill.
 * - Broke (<10 XP) → silent skip + discoverable "Analyse · 10 XP" button → XPGate.
 */
function FitRationale({ token, jobId, cached }: FitRationaleProps) {
  const stream = useStreamingText()
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const gate = useXPGate({ cost: XP_POLICY.analyseJobCost, action: "analyse_job" })
  const startedRef = React.useRef(false)

  const begin = React.useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    stream.start(`/jobs/analyse/${jobId}/stream`, token, (ev: StreamEvent) => {
      if (ev.type === "done" && typeof ev.new_xp_balance === "number") {
        applyXpChange({ newBalance: ev.new_xp_balance as number, action: "analyse_job" })
      }
    })
  }, [applyXpChange, jobId, stream, token])

  // Auto-fire once for funded users on a job with no cached rationale.
  React.useEffect(() => {
    if (cached || !token) return
    if (!gate.canAfford) return
    begin()
  }, [cached, token, gate.canAfford, begin])

  if (cached) {
    return <blockquote className="mc-fit-quote">{stripMarkdown(cached)}</blockquote>
  }

  // Streaming or settled with text.
  if (stream.text) {
    return (
      <blockquote className="mc-fit-quote" style={{ minHeight: "3.6em" }}>
        {stream.status === "done" && !stream.typing ? stripMarkdown(stream.text) : stream.text}
        {stream.typing && <span className="mc-fit-caret" aria-hidden>▋</span>}
        {stream.status === "error" && (
          <button type="button" className="mc-fit-retry" onClick={() => { startedRef.current = false; begin() }}>
            ⚠ interrupted · retry
          </button>
        )}
      </blockquote>
    )
  }

  // Error before any text.
  if (stream.status === "error") {
    return (
      <blockquote className="mc-fit-quote" style={{ color: "var(--tm-text-faint)", fontStyle: "italic" }}>
        Couldn&rsquo;t analyse this role.{" "}
        <button type="button" className="mc-fit-retry" onClick={() => { startedRef.current = false; begin() }}>
          retry
        </button>
      </blockquote>
    )
  }

  // Funded + about to stream → loading shimmer placeholder.
  if (gate.canAfford && !cached) {
    return (
      <blockquote className="mc-fit-quote" style={{ color: "var(--tm-text-faint)", fontStyle: "italic", minHeight: "3.6em" }}>
        Analysing this role
        <span className="mc-fit-caret" aria-hidden>▋</span>
      </blockquote>
    )
  }

  // Broke → discoverable button, no auto-modal hammer.
  return (
    <blockquote className="mc-fit-quote" style={{ color: "var(--tm-text-faint)", fontStyle: "italic" }}>
      <button
        type="button"
        className="mc-fit-analyse-cta"
        onClick={() => gate.attempt(begin)}
      >
        → Analyse · {XP_POLICY.analyseJobCost} XP
      </button>
    </blockquote>
  )
}

interface SkillMatchRowProps {
  skill: SkillGapItem
  inCart: boolean
  onDominate: () => void
}

function SkillMatchRow({ skill, inCart, onDominate }: SkillMatchRowProps) {
  const level = Math.max(0, Math.min(MAX_LEVEL, Math.round(skill.user_level ?? 0)))
  const sessions = level >= MAX_LEVEL ? 0 : sessionsForGap(level, level + 1)
  const activeSkill = useForgeTimerStore(s => s.skillName)
  const sessionActive = useForgeTimerStore(s => s.sessionActive)
  const isForging = sessionActive && activeSkill?.toLowerCase() === skill.skill.toLowerCase()
  const state: ForgeChipState = isForging ? "active" : inCart ? "cart" : "idle"
  return (
    <div className="mc-skill-match-row">
      <div className="name">{stripTaxonomySuffix(skill.skill)}</div>
      <div className="right">
        <ForgeChip
          skillName={skill.skill}
          level={level}
          sessionsToNext={sessions}
          state={state}
          onClick={onDominate}
          ariaLabel={`${skill.skill} · push L${level} → L${level + 1} · ${sessions} session${sessions === 1 ? "" : "s"}`}
        />
      </div>
    </div>
  )
}
