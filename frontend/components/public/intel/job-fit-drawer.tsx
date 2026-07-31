"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { jobs, publicCv, type PublicJobFitPreviewResponse } from "@/lib/api"
import { trackEvent } from "@/lib/analytics"
import { stashAnonCv } from "@/lib/anon-cv-stash"
import { dataKeys } from "@/lib/domain-data"
import { fitBand, jobFitNextPath } from "@/lib/job-fit-intent"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import type { ResultJob } from "./intel-results"
import type { JobRowFit } from "./intel-rows"

interface Props {
  open: boolean
  job: ResultJob | null
  companyName: string | null
  token: string | null
  hasCv: boolean
  fit: JobRowFit | null
  onClose: () => void
}

export function JobFitDrawer({
  open, job, companyName, token, hasCv, fit, onClose,
}: Props) {
  const router = useRouter()
  const signup = useSignupGate()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<PublicJobFitPreviewResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const authed = !!token
  const jobId = job?.id ?? ""

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  useEffect(() => {
    setPreview(null)
    setError(null)
    setBusy(false)
    setSaving(false)
    if (open && job) {
      trackEvent("public_fit_drawer_opened", {
        job_id: job.id,
        company: companyName ?? "",
        surface: "intel",
        authed: authed ? "1" : "0",
        has_cv: hasCv ? "1" : "0",
      })
    }
  }, [open, job, companyName, authed, hasCv])

  const gapQuery = useQuery({
    queryKey: jobId ? dataKeys.skillGap(jobId) : ["skill-gap", "none"],
    queryFn: () => jobs.skillGap(token as string, jobId),
    enabled: open && !!token && hasCv && !!jobId,
    staleTime: 10 * 60 * 1000,
  })

  const readout = useMemo(() => {
    if (preview) {
      return {
        score: preview.fit_pct,
        matchedCount: preview.matched_count,
        totalSkills: preview.total_skills,
        matchedSkills: preview.matched_skills,
        missingSkills: preview.missing_skills,
      }
    }

    const gap = gapQuery.data
    const have = gap?.skills.filter((s) => !s.missing).map((s) => s.skill) ?? fit?.matched_skills ?? []
    const missing = gap?.skills.filter((s) => s.missing).map((s) => s.skill) ?? []
    if (fit) {
      return {
        score: fit.overlap_score,
        matchedCount: fit.matched_count,
        totalSkills: fit.total_skills,
        matchedSkills: have,
        missingSkills: missing,
      }
    }
    return null
  }, [fit, gapQuery.data, preview])

  if (!open || !job) return null

  async function handleFile(file: File) {
    if (!job) return
    setBusy(true)
    setError(null)
    trackEvent("public_fit_cv_uploaded", {
      job_id: job.id,
      company: companyName ?? "",
      surface: "intel",
      authed: "0",
      has_cv: "0",
    })
    try {
      const result = await publicCv.jobFitPreview(job.id, file)
      stashAnonCv(file, result.cv_preview)
      setPreview(result)
      trackEvent("public_fit_preview_shown", {
        job_id: job.id,
        company: companyName ?? "",
        surface: "intel",
        authed: "0",
        has_cv: "1",
        fit_band: fitBand(result.fit_pct),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check this role against your CV.")
    } finally {
      setBusy(false)
    }
  }

  async function saveAndTailor() {
    if (!job) return

    if (!token) {
      trackEvent("public_fit_signup_started", {
        job_id: job.id,
        company: companyName ?? "",
        surface: "intel",
        authed: "0",
        has_cv: preview ? "1" : "0",
      })
      // KNOWN GAP: the job context (jobFitNextPath → /cv?upload=1&jobId=…) used
      // to ride along as `next` and was discarded by postAuthDestination, so an
      // anon user has always lost this job through auth and lands on the plain
      // CV claim. Carrying it needs a stashed intent + a postAuthDestination
      // branch, the shape the anon-CV and pending-job-save exceptions use.
      signup.open({ surface: "manual", source: "public_fit_preview" })
      return
    }

    setSaving(true)
    setError(null)
    try {
      await jobs.saveJob(token, job.id)
      trackEvent("public_fit_save_tailor_clicked", {
        job_id: job.id,
        company: companyName ?? "",
        surface: "intel",
        authed: "1",
        has_cv: hasCv ? "1" : "0",
        fit_band: readout ? fitBand(readout.score) : "gap",
      })
      router.push(`/cv?jobId=${encodeURIComponent(job.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this role.")
    } finally {
      setSaving(false)
    }
  }

  function uploadForAuthedUser() {
    if (!job) return
    router.push(jobFitNextPath({ jobId: job.id, hasReplayableCv: false }))
  }

  const band = readout ? fitBand(readout.score) : "gap"
  const title = companyName ? `${job.title} at ${companyName}` : job.title

  return (
    <div className="tm-intel-fit-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="tm-intel-fit-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Fit for ${title}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="tm-intel-fit-drawer-close" onClick={onClose} aria-label="Close fit preview">
          x
        </button>

        <div className="tm-intel-fit-drawer-head">
          <span className="tm-intel-fit-drawer-kicker">Role fit</span>
          <h3>{job.title}</h3>
          <p>
            {[companyName, job.city, job.mode].filter(Boolean).join(" - ")}
          </p>
        </div>

        {readout ? (
          <div className={`tm-intel-fit-readout is-${band}`}>
            <div className="tm-intel-fit-score">
              <strong>{Math.round(readout.score)}%</strong>
              <span>{readout.matchedCount} of {readout.totalSkills} listed skills</span>
            </div>
            <div className="tm-intel-fit-bar" aria-hidden="true">
              <div style={{ width: `${Math.max(0, Math.min(100, readout.score))}%` }} />
            </div>
            <SkillBlock label="You have" skills={readout.matchedSkills} tone="have" />
            <SkillBlock label="To close" skills={readout.missingSkills} tone="missing" />
          </div>
        ) : authed && !hasCv ? (
          <div className="tm-intel-fit-upload-state">
            <p>Upload your CV to check this role.</p>
            <button type="button" className="tm-intel-fit-primary" onClick={uploadForAuthedUser}>
              Upload CV for this role
            </button>
          </div>
        ) : authed ? (
          <div className="tm-intel-fit-upload-state">
            <p>No listed skill map is available for this role yet.</p>
          </div>
        ) : (
          <div className="tm-intel-fit-upload-state" data-source="public_fit_preview">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ""
              }}
            />
            <p>Drop in your CV to check this exact role.</p>
            <button
              type="button"
              className="tm-intel-fit-primary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Checking fit..." : "Choose CV"}
            </button>
          </div>
        )}

        {error ? <p className="tm-intel-fit-error" role="alert">{error}</p> : null}

        <div className="tm-intel-fit-actions">
          <button
            type="button"
            className="tm-intel-fit-primary"
            disabled={saving || (!readout && !authed)}
            onClick={() => void saveAndTailor()}
          >
            {saving ? "Saving..." : "Save + tailor CV"}
          </button>
          <button type="button" className="tm-intel-fit-secondary" onClick={onClose}>
            Back to roles
          </button>
        </div>
      </aside>
    </div>
  )
}

function SkillBlock({
  label, skills, tone,
}: { label: string; skills: string[]; tone: "have" | "missing" }) {
  if (!skills.length) return null
  return (
    <div className="tm-intel-fit-skills-block">
      <div className="tm-intel-fit-skills-label">{label}</div>
      <div className="tm-intel-fit-chip-row">
        {skills.slice(0, 8).map((skill) => (
          <span className={`tm-intel-fit-chip is-${tone}`} key={skill}>{skill}</span>
        ))}
      </div>
    </div>
  )
}
