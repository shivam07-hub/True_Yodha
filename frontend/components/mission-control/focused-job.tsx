"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Icon } from "./icons"
import { jobs, type ApplicationStatus, type JobMatch, type SkillGapItem, type SkillGapResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { APPLICATION_STAGES, APPLICATION_OUTCOMES } from "@/lib/api"
import { MAX_LEVEL, sessionsForGap } from "@/lib/level-thresholds"

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

  return (
    <div className="mc-focus-row" ref={ref}>
      <div className={`mc-focus-card${isNew ? " is-new" : ""}`} data-cycle={cycleIndex}>
        <div className="mc-focus-head">
          <div style={{ minWidth: 0 }}>
            <div className="mc-focus-eyebrow">
              Focused on: <span className="strong">{job.company ?? "—"}</span>
            </div>
            <h2 className="mc-focus-title">{job.title}</h2>
            <div className="mc-focus-sub">
              <span>
                {[job.company, job.location].filter(Boolean).join(" · ")}
              </span>
              {job.job_id ? (
                <button
                  type="button"
                  className="id tm-control-focus"
                  onClick={() => navigator.clipboard.writeText(String(job.job_id))}
                  title="Copy Job ID"
                  aria-label="Copy job id"
                >
                  {job.job_id}
                </button>
              ) : null}
              {job.source_url ? (
                <a href={job.source_url} target="_blank" rel="noopener noreferrer">
                  Open JD <Icon name="ext" size={11} />
                </a>
              ) : null}
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
                  ✓ {s.skill}
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
          {job.llm_explanation ? (
            <blockquote className="mc-fit-quote">{job.llm_explanation}</blockquote>
          ) : (
            <blockquote className="mc-fit-quote" style={{ color: "var(--tm-text-faint)", fontStyle: "italic" }}>
              Analyse this role to see Myro&rsquo;s reasoning.
            </blockquote>
          )}
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
            return (
              <div className="mc-skill-build-row" key={s.skill}>
                <div className="name">{s.skill}</div>
                <div className="meta">
                  <span className="lvl">L{fromLvl}→L{toLvl}</span>
                  <button
                    type="button"
                    className={`mc-lock-btn tm-control-focus${inCart ? " is-active" : ""}`}
                    onClick={() => onSkillToggle(s)}
                  >
                    {inCart ? "Locked ✓" : `Lock in · ${sessions} ses`}
                  </button>
                </div>
              </div>
            )
          })
        )}

      </aside>
    </div>
  )
})

interface SkillMatchRowProps {
  skill: SkillGapItem
  inCart: boolean
  onDominate: () => void
}

function SkillMatchRow({ skill, inCart, onDominate }: SkillMatchRowProps) {
  const level = Math.max(0, Math.min(MAX_LEVEL, Math.round(skill.user_level ?? 0)))
  const atMax = level >= MAX_LEVEL
  const sessions = atMax ? 0 : sessionsForGap(level, level + 1)
  return (
    <div className="mc-skill-match-row">
      <div className="name">{skill.skill}</div>
      <div className="right">
        <div className="mc-lvl-dots">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`d${i < level ? " on" : ""}`} />
          ))}
        </div>
        <span className="mc-lvl-label">L{level}</span>
        {atMax ? (
          <span className="mc-lvl-status">Maxed</span>
        ) : (
          <button
            type="button"
            className={`mc-dominate-btn tm-control-focus${inCart ? " is-active" : ""}`}
            onClick={onDominate}
            title={`Push L${level} → L${level + 1} · ${sessions} session${sessions === 1 ? "" : "s"}`}
          >
            {inCart ? `Locked · ${sessions} ses` : `Dominate · ${sessions} ses`}
          </button>
        )}
      </div>
    </div>
  )
}
