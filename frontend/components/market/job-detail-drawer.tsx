"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { jobs, type JobFeedItem, type JobPulse, type QualityReasonCode } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { QUALITY_REASONS } from "@/lib/jobs/feedback"
import { LocationLine, SkillChip } from "./job-card"

/**
 * List → detail (LinkedIn pattern). Apply lives HERE, after the user has read
 * the JD — a considered action, not a feed reflex. Save/Skip stay on the card.
 */
export function JobDetailDrawer({
  job, pulse, token, onClose, followed, onToggleFollow, onSave,
}: {
  job: JobFeedItem
  pulse?: JobPulse
  token: string
  onClose: () => void
  followed: boolean
  onToggleFollow: () => void
  onSave: () => void
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Confidence drives the trust band (D1). Fall back to the feed's binary
  // is_stale only when no pulse has hydrated yet (pre-backend / cold cards).
  const confidence = pulse?.listing_confidence ?? (job.is_stale ? "uncertain" : "active")
  const concerning = confidence === "uncertain" || confidence === "likely_closed" || confidence === "closed"
  const verifiedDays = daysAgo(pulse?.last_verified_at ?? job.last_seen_at)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Dead-link capture (slice 5): when the user clicks through to the company
  // portal and comes back, ask once "was this still live?". A "No" is the
  // strongest, click-verified evidence a listing is closed.
  const appliedAt = useRef<number | null>(null)
  const [askLive, setAskLive] = useState(false)
  const [linkAnswered, setLinkAnswered] = useState(false)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (appliedAt.current == null || linkAnswered) return
      if (Date.now() - appliedAt.current < 1200) return // ignore an instant bounce
      setAskLive(true)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [linkAnswered])

  if (!mounted) return null

  return createPortal(
    <>
      <div onClick={onClose} className="tm-feed-scrim" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60, animation: "tmScrimIn 200ms ease both" }} />
      <aside
        className="tm-feed-drawer"
        role="dialog"
        aria-label={job.job_title}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 100vw)", zIndex: 61, background: "var(--tm-bg, var(--tm-surface))", borderLeft: "1px solid var(--tm-border-soft)", display: "flex", flexDirection: "column", boxShadow: "-12px 0 32px rgba(0,0,0,0.18)", animation: "tmDrawerIn 280ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "20px 24px", borderBottom: "1px solid var(--tm-border-soft)" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.25 }}>{job.job_title}</h2>
            {job.company_name ? <div style={{ fontSize: 14, color: "var(--tm-interactive)", marginTop: 4 }}>{job.company_name}</div> : null}
            <div style={{ marginTop: 8 }}><LocationLine job={job} /></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text-muted)", cursor: "pointer", fontSize: 16 }}>×</button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {job.skills.length > 0 ? (
            <div>
              <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-muted)", marginBottom: 8 }}>Key skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{job.skills.map(s => <SkillChip key={s} label={s} />)}</div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => router.push(`/forge?gap=${encodeURIComponent(job.job_id)}`)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--tm-int-border-soft)", background: "var(--tm-int-bg-wash)", color: "var(--tm-interactive)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            <span>◎ Assess my readiness for this job</span>
            <span aria-hidden>→</span>
          </button>
          <div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-muted)", marginBottom: 8 }}>Job description</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.6, color: "var(--tm-text)" }}>{job.job_description || "No description available."}</pre>
          </div>
        </div>

        {/* Dead-link prompt — highest-value, click-verified capture (slice 5). */}
        {askLive ? (
          <ApplyReturnPrompt
            onAnswer={(live) => {
              setLinkAnswered(true)
              setAskLive(false)
              if (!live) {
                void jobs.submitFeedback(token, {
                  client_event_id: crypto.randomUUID(),
                  job_id: job.job_id,
                  feedback_kind: "quality",
                  reason_code: "apply_link_closed",
                  surface: "job_detail",
                }).catch(() => { /* best-effort */ })
                setMsg("Thanks — flagged for review")
              }
            }}
          />
        ) : null}

        {/* Confidence trust band (D1) — only the earned disclosure carries words. */}
        {concerning ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", fontSize: 12, color: "var(--tm-warning)", borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-warning-wash)" }}>
            <span aria-hidden>⚠</span>
            <span>
              {verifiedDays != null ? `Last verified ${verifiedDays}d ago — ` : ""}apply link may be closed.
            </span>
          </div>
        ) : null}

        {msg ? <div style={{ padding: "10px 24px", fontSize: 12, color: "var(--tm-text-muted)", borderTop: "1px solid var(--tm-border-soft)" }}>{msg}</div> : null}

        <footer style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 24px", borderTop: "1px solid var(--tm-border-soft)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {job.source_url ? (
              <a href={job.source_url} target="_blank" rel="noopener noreferrer" onClick={() => { appliedAt.current = Date.now() }} style={{ flex: "1 1 auto", textAlign: "center", padding: "11px 16px", borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 13, background: "var(--tm-interactive)", color: "var(--tm-on-interactive, #fff)" }}>Apply ↗</a>
            ) : null}
            <button type="button" onClick={() => { if (!saved) { onSave(); setSaved(true); setMsg("Saved to your shortlist") } }} disabled={saved} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)", fontWeight: 600, fontSize: 13, cursor: saved ? "default" : "pointer" }}>{saved ? "★ Saved" : "★ Save"}</button>
            <button type="button" onClick={() => onToggleFollow()} style={{ padding: "11px 16px", borderRadius: 10, border: `1px solid ${followed ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`, background: followed ? "var(--tm-int-bg-wash)" : "transparent", color: followed ? "var(--tm-interactive)" : "var(--tm-text-muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{followed ? "✓ Heatmap" : "+ Heatmap"}</button>
          </div>
          <ReportProblem token={token} jobId={job.job_id} />
        </footer>
      </aside>
    </>,
    document.body,
  )
}

/** The dead-link prompt after a click-through to the company portal. */
function ApplyReturnPrompt({ onAnswer }: { onAnswer: (live: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 24px", borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-int-bg-wash)", fontSize: 12.5, flexWrap: "wrap" }}>
      <span style={{ color: "var(--tm-text)", fontWeight: 600 }}>Was this still live?</span>
      <button type="button" onClick={() => onAnswer(true)} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)", fontSize: 12, cursor: "pointer" }}>Yes</button>
      <button type="button" onClick={() => onAnswer(false)} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid var(--tm-danger)", background: "transparent", color: "var(--tm-danger)", fontSize: 12, cursor: "pointer" }}>No, it&rsquo;s gone</button>
    </div>
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
        <Link href="/home" style={{ color: "var(--tm-interactive)" }}>Tracking what happened still counts →</Link>
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
