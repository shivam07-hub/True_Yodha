"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { jobs, type JobFeedItem, type JobPulse, type QualityReasonCode } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { QUALITY_REASONS } from "@/lib/jobs/feedback"
import { DetailDrawer } from "@/components/jobs/detail-drawer"
import { DetailHeader } from "@/components/jobs/detail-header"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { ApplyRow } from "@/components/jobs/apply-row"
import { MyroTake } from "@/components/jobs/myro-take"
import { LocationLine, SkillChip } from "./job-card"
import { JobReadinessPanel } from "./job-readiness"
import { ShareJobButton } from "./share-job-button"

/**
 * Live job detail (discover stage). Shares the canonical drawer shell with the
 * Dashboard's build stage — same chrome, same motion, same header. Apply lives
 * HERE, after the user has read the JD. Save/Skip stay on the card; "Save &
 * tailor now" is the one-tap bridge into the build stage.
 */
export function JobDetailDrawer({
  job, pulse, token, onClose, onSave,
}: {
  job: JobFeedItem
  pulse?: JobPulse
  token: string
  onClose: () => void
  onSave: () => void
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [assessOpen, setAssessOpen] = useState(false)
  const confidence = pulse?.listing_confidence ?? (job.is_stale ? "uncertain" : "active")
  const capture = useApplyCapture({
    token,
    job: { job_id: job.job_id, source_url: job.source_url, company: job.company_name, listing_confidence: confidence },
    surface: "job_detail",
    intentSurface: "market",
    // The feed is already fit-ranked, so closing back to it IS "similar roles".
    onFindSimilar: onClose,
  })

  // Confidence drives the trust band (D1). Fall back to the feed's binary
  // is_stale only when no pulse has hydrated yet (pre-backend / cold cards).
  const concerning = confidence === "uncertain" || confidence === "likely_closed" || confidence === "closed"
  const verifiedDays = daysAgo(pulse?.last_verified_at ?? job.last_seen_at)
  const reportedGone = pulse?.quality_report_count != null && pulse.quality_report_count > 0
    ? pulse.quality_report_count
    : null

  // Capture the save, then cross straight into the build stage for THIS job —
  // /cv?jobId opens the tailoring playground (not the generic home).
  const saveAndTailor = () => {
    if (!saved) { onSave(); setSaved(true) }
    router.push(`/cv?jobId=${encodeURIComponent(job.job_id)}`)
  }

  return (
    <DetailDrawer
      open
      onClose={onClose}
      ariaLabel={job.job_title}
      header={
        <DetailHeader
          title={job.job_title}
          company={job.company_name}
          location={<LocationLine job={job} />}
          onClose={onClose}
        />
      }
      footer={
        <>
          {/* Apply Transport capture — highest-value, click-verified liveness. */}
          <ApplyCapturePrompt capture={capture} />

          {/* Confidence trust band (D1) — only the earned disclosure carries words.
              When the crowd has reported it gone, lead with that count: it's the
              specific, user-verified evidence behind the confidence state. */}
          {reportedGone ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", fontSize: 12, color: "var(--tm-warning)", borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-warning-wash)" }}>
              <span aria-hidden>⚠</span>
              <span>{reportedGone} {reportedGone === 1 ? "applicant" : "applicants"} reported this listing gone.</span>
            </div>
          ) : concerning ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", fontSize: 12, color: "var(--tm-warning)", borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-warning-wash)" }}>
              <span aria-hidden>⚠</span>
              <span>{verifiedDays != null ? `Last verified ${verifiedDays}d ago — ` : ""}apply link may be closed.</span>
            </div>
          ) : verifiedDays != null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", fontSize: 12, color: "var(--tm-text-muted)", borderTop: "1px solid var(--tm-border-soft)" }}>
              <span aria-hidden>✓</span>
              <span>Verified {verifiedDays === 0 ? "today" : `${verifiedDays}d ago`}</span>
            </div>
          ) : null}

          {msg ? <div style={{ padding: "10px 24px", fontSize: 12, color: "var(--tm-text-muted)", borderTop: "1px solid var(--tm-border-soft)" }}>{msg}</div> : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 24px calc(16px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* PRIMARY — tailor a CV for THIS job, Myro's core value. One tap
                  captures the save and crosses into the build stage. */}
              <button type="button" onClick={saveAndTailor} style={{ flex: "1 1 auto", textAlign: "center", padding: "11px 16px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 13, background: "var(--tm-interactive)", color: "var(--tm-on-interactive, #fff)", cursor: "pointer" }}>Tailor now →</button>
              {/* SECONDARY — apply on the source site (outline, not the accent). */}
              {capture.target.kind === "direct" ? (
                <a href={capture.href ?? undefined} target="_blank" rel="noopener noreferrer" onClick={capture.onApply} style={{ padding: "11px 16px", borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 13, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)" }}>{capture.target.actionLabel} ↗</a>
              ) : (
                <ApplyRow company={job.company_name} title={job.job_title} jobId={job.job_id} variant="compact" onApply={capture.onApply} />
              )}
              <button type="button" onClick={() => { if (!saved) { onSave(); setSaved(true); setMsg("Saved to your shortlist") } }} disabled={saved} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)", fontWeight: 600, fontSize: 13, cursor: saved ? "default" : "pointer" }}>{saved ? "★ Saved" : "★ Save"}</button>
              <ShareJobButton job={job} variant="drawer" />
            </div>
            <ReportProblem token={token} jobId={job.job_id} />
          </div>
        </>
      }
    >
      {/* Myro's take — the Matching Brain's verdict on THIS job (Consolidation D).
          Computed once on first open, cached thereafter. Renders nothing when the
          brain has nothing to say. */}
      <MyroTake token={token} jobId={job.job_id} />
      {job.skills.length > 0 ? (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-muted)", marginBottom: 8 }}>Key skills</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{job.skills.map(s => <SkillChip key={s} label={s} />)}</div>
        </div>
      ) : null}
      {/* Job-SPECIFIC readiness, inline (T2-5). The button is the discloser; the
          answer (match% + have/missing vs THIS job) opens right here — no detour
          to the generic Skills page. Lazy: nothing fetched until asked. */}
      <div style={{ marginBottom: 18 }}>
        <button
          type="button"
          aria-expanded={assessOpen}
          onClick={() => setAssessOpen((v) => !v)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--tm-int-border-soft)", background: "var(--tm-int-bg-wash)", color: "var(--tm-interactive)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          <span>◎ Assess my readiness for this job</span>
          <span aria-hidden style={{ transform: assessOpen ? "rotate(90deg)" : "none", transition: "transform 160ms var(--tm-ease, ease)" }}>→</span>
        </button>
        {assessOpen ? (
          <div style={{ padding: "14px", marginTop: 8, borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "var(--tm-surface)" }}>
            <JobReadinessPanel token={token} jobId={job.job_id} />
          </div>
        ) : null}
      </div>
      <div>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-muted)", marginBottom: 8 }}>Job description</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.6, color: "var(--tm-text)" }}>{job.job_description || "No description available."}</pre>
      </div>
    </DetailDrawer>
  )
}

/**
 * Deliberate quality reporting (D4) — the 5 listing-defect reasons, kept apart
 * from the fast skip. At the daily cap (429) it doesn't punish: it redirects to
 * the uncapped outcome loop. No XP, and never a promise of removal (one report
 * can't close a job).
 */
function ReportProblem({ token, jobId }: { token: string; jobId: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [capped, setCapped] = useState(false)
  const [busy, setBusy] = useState(false)

  const send = async (reason: QualityReasonCode) => {
    if (busy) return
    setBusy(true)
    try {
      await jobs.submitFeedback(token, {
        client_event_id: crypto.randomUUID(),
        job_id: jobId,
        feedback_kind: "quality",
        reason_code: reason,
        surface: "job_detail",
      })
      setDone("Thanks — flagged for review")
      setOpen(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setCapped(true)
      else setDone("Couldn’t send — try again")
    } finally {
      setBusy(false)
    }
  }

  if (done) return <div style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>{done}</div>
  if (capped) {
    return (
      <div style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>
        Daily report limit reached.{" "}
        <Link href="/collections" style={{ color: "var(--tm-interactive)" }}>Tracking what happened still counts →</Link>
      </div>
    )
  }
  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: "none", padding: 0, color: "var(--tm-text-faint)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
          Report a problem
        </button>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {QUALITY_REASONS.map(r => (
            <button key={r.code} type="button" disabled={busy} onClick={() => send(r.code)} style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text-muted)", fontSize: 11.5, cursor: busy ? "default" : "pointer" }}>
              {r.label}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--tm-text-faint)", fontSize: 11.5, cursor: "pointer" }}>cancel</button>
        </div>
      )}
    </div>
  )
}

/** Whole days between an ISO date and now, or null when unparseable. */
function daysAgo(iso?: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}
