"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Icon } from "./icons"
import { jobs, type ApplicationStatus, type JobMatch, type SkillGapItem, type SkillGapResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { APPLICATION_STAGES, APPLICATION_OUTCOMES } from "@/lib/api"

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
  const missingSkills = skills.filter((s) => s.missing)
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

        <div className="mc-skill-rows">
          {matchedDisplay.length > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {matchedDisplay.map((s) => (
                <span className="mc-skill-pill matched" key={s.skill}>
                  ✓ {s.skill}
                </span>
              ))}
            </div>
          ) : null}
          {missingSkills.slice(0, 3).map((s) => (
            <span className="mc-skill-pill missing" key={s.skill}>
              Missing · {s.skill}
            </span>
          ))}
        </div>

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
                {matchedSkills.slice(0, 8).map((s) => (
                  <SkillMatchRow key={s.skill} skill={s} />
                ))}
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
            return (
              <div className="mc-skill-build-row" key={s.skill}>
                <div className="name">{s.skill}</div>
                <div className="meta">
                  <span className="lvl">
                    L{s.user_level ?? 0}→L{s.required_level ?? 1}
                  </span>
                  <button
                    type="button"
                    className={`mc-lock-btn tm-control-focus${inCart ? " is-active" : ""}`}
                    onClick={() => onSkillToggle(s)}
                  >
                    {inCart ? "Locked ✓" : "Lock in · 12 ses"}
                  </button>
                </div>
              </div>
            )
          })
        )}

        <div className="mc-forecast">
          <div className="mc-forecast-title">Forecast</div>
          {missingSkills.length > 0 ? (
            <div>
              Closing {missingSkills.length} gap{missingSkills.length === 1 ? "" : "s"} →{" "}
              <span className="num">+{Math.min(30, missingSkills.length * 9)} Fit</span>
              {" · "}
              {missingSkills.length * 2} session{missingSkills.length * 2 === 1 ? "" : "s"}
            </div>
          ) : null}
          <div>
            Apply now → <span className="mono">{fit} → {Math.min(100, fit + 18)}</span> with tailored CV
          </div>
        </div>
      </aside>
    </div>
  )
})

function SkillMatchRow({ skill }: { skill: SkillGapItem }) {
  const level = Math.max(0, Math.min(5, Math.round(skill.user_level ?? 0)))
  const matched = !skill.missing
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
        {matched ? <span className="mc-lvl-status">Matched</span> : null}
      </div>
    </div>
  )
}
