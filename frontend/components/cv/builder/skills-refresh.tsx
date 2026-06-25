/**
 * SkillsRefresh — keep the CV SKILLS section current with the living skill graph.
 *
 * The CV's skills line is frozen at upload; every forge level-up / quiz clear /
 * re-tag grows the user's skill graph but never flows back into the one box
 * recruiters + ATS scan. This proposes a primary-first line that surfaces
 * proven-but-missing skills — reviewable, never auto-applied, nothing invented.
 *
 * Propose is FREE + read-only. Keep applies the line into the living-master
 * autosave draft (the parent persists via PUT /cv/master) — no charge, mirroring
 * the free Rewrite path. Discard does nothing.
 */
"use client"

import { useCallback, useEffect, useState } from "react"
import { cv as cvApi, type SkillsRefreshResponse } from "@/lib/api"
import { Icon } from "./icons"

type Phase = "loading" | "proposal" | "error"

interface SkillsRefreshProps {
  token: string
  /** Pass a job_id to lead the primary band with that job's required skills. */
  jobId?: string | null
  /** Apply the kept line — the parent writes it into the autosave draft. */
  onKeep: (proposedSkillsLine: string) => void
  onClose: () => void
}

export function SkillsRefresh({ token, jobId, onKeep, onClose }: SkillsRefreshProps) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [data, setData] = useState<SkillsRefreshResponse | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const propose = useCallback(async () => {
    setPhase("loading"); setErrMsg(null)
    try {
      const res = await cvApi.skillsRefresh(token, jobId)
      setData(res)
      setPhase("proposal")
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Couldn’t read your skills. Try again.")
      setPhase("error")
    }
  }, [token, jobId])

  useEffect(() => { void propose() }, [propose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const basis = data?.job_title ? ` for ${data.job_title}` : ""

  return (
    <div
      className="cvb-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Refresh skills"
      onClick={onClose}
    >
      <div className="cvb-modal tm-skref-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cvb-modal-head">
          <Icon name="sparkle" size={14}/> Refresh your skills{basis}
        </div>

        {phase === "loading" && (
          <div className="tm-skref-body">
            <div className="cvb-rw-status" role="status">✦ Reading your proven skills…</div>
            <p className="tm-skref-note">
              Surfacing skills you’ve proven in Myro that aren’t on your CV yet, and
              ordering them so the most relevant lead. Nothing is invented.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="tm-skref-body">
            <p className="cvb-rs-error" role="alert">{errMsg}</p>
            <div className="tm-skref-foot">
              <button type="button" className="cvb-btn sm" onClick={onClose}>Close</button>
              <button type="button" className="cvb-btn sm primary" onClick={() => void propose()}>Try again</button>
            </div>
          </div>
        )}

        {phase === "proposal" && data && (
          <div className="tm-skref-body">
            {!data.changed ? (
              <>
                <p className="tm-skref-uptodate">
                  <Icon name="check" size={13} stroke={3} aria-hidden/> Your skills section is already up to date.
                </p>
                <div className="tm-skref-foot">
                  <button type="button" className="cvb-btn sm primary" onClick={onClose}>Close</button>
                </div>
              </>
            ) : (
              <>
                {data.added.length > 0 && (
                  <div className="tm-skref-section">
                    <div className="tm-skref-label">Adding {data.added.length} proven skill{data.added.length > 1 ? "s" : ""}</div>
                    <ul className="tm-skref-added">
                      {data.added.map((a) => (
                        <li key={a.display_name}>
                          <Icon name="check" size={11} stroke={3} aria-hidden/>
                          <span className="tm-skref-added-name">{a.display_name}</span>
                          <span className="tm-skref-added-reason">{a.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="tm-skref-section">
                  <div className="tm-skref-label">{data.job_title ? "Most relevant for this job" : "Core skills"}</div>
                  <div className="tm-skref-chips">
                    {data.primary.map((s) => <span key={s} className="tm-skref-chip primary">{s}</span>)}
                    {data.primary.length === 0 && <span className="tm-skref-empty">—</span>}
                  </div>
                </div>

                {data.secondary.length > 0 && (
                  <div className="tm-skref-section">
                    <div className="tm-skref-label">Also</div>
                    <div className="tm-skref-chips">
                      {data.secondary.map((s) => <span key={s} className="tm-skref-chip">{s}</span>)}
                    </div>
                  </div>
                )}

                <p className="tm-skref-note">Existing skills are kept and reordered — none are removed.</p>

                <div className="tm-skref-foot">
                  <button type="button" className="cvb-btn sm" onClick={onClose}>Discard</button>
                  <button
                    type="button"
                    className="cvb-btn sm primary"
                    onClick={() => { onKeep(data.proposed_skills_line); onClose() }}
                  >
                    <Icon name="check" size={12}/> Use these skills
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
