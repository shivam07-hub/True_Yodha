"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useMutation } from "@tanstack/react-query"
import { jobs, type JobFeedItem } from "@/lib/api"
import { LocationLine, SkillChip } from "./job-card"

/**
 * List → detail (LinkedIn pattern). Apply lives HERE, after the user has read
 * the JD — a considered action, not a feed reflex. Save/Skip stay on the card.
 */
export function JobDetailDrawer({
  job, token, onClose, followed, onToggleFollow, onSave,
}: {
  job: JobFeedItem
  token: string
  onClose: () => void
  followed: boolean
  onToggleFollow: () => void
  onSave: () => void
}) {
  const [reported, setReported] = useState(false)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const reportMut = useMutation({
    mutationFn: () => jobs.reportInactive(token, job.job_id),
    onSuccess: () => { setReported(true); setMsg("Reported — thanks. +10 tokens") },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Could not report"),
  })

  const staleDays = job.is_stale ? daysAgo(job.last_seen_at) : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

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
          <div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-muted)", marginBottom: 8 }}>Job description</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.6, color: "var(--tm-text)" }}>{job.job_description || "No description available."}</pre>
          </div>
        </div>

        {job.is_stale ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", fontSize: 12, color: "var(--tm-warning)", borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-warning-wash)" }}>
            <span aria-hidden>⚠</span>
            <span>
              {staleDays != null ? `Last seen ${staleDays} days ago — ` : ""}this posting may be filled; the apply link could be outdated.
            </span>
          </div>
        ) : null}

        {msg ? <div style={{ padding: "10px 24px", fontSize: 12, color: "var(--tm-text-muted)", borderTop: "1px solid var(--tm-border-soft)" }}>{msg}</div> : null}

        <footer style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid var(--tm-border-soft)", flexWrap: "wrap" }}>
          {job.source_url ? (
            <a href={job.source_url} target="_blank" rel="noopener noreferrer" style={{ flex: "1 1 auto", textAlign: "center", padding: "11px 16px", borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 13, background: "var(--tm-interactive)", color: "var(--tm-on-interactive, #fff)" }}>Apply ↗</a>
          ) : null}
          <button type="button" onClick={() => { if (!saved) { onSave(); setSaved(true); setMsg("Saved to your shortlist") } }} disabled={saved} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)", fontWeight: 600, fontSize: 13, cursor: saved ? "default" : "pointer" }}>{saved ? "★ Saved" : "★ Save"}</button>
          <button type="button" onClick={() => onToggleFollow()} style={{ padding: "11px 16px", borderRadius: 10, border: `1px solid ${followed ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`, background: followed ? "var(--tm-int-bg-wash)" : "transparent", color: followed ? "var(--tm-interactive)" : "var(--tm-text-muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{followed ? "✓ Heatmap" : "+ Heatmap"}</button>
          <button type="button" onClick={() => reportMut.mutate()} disabled={reported || reportMut.isPending} title="Report this posting as no longer active" style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-danger)", fontWeight: 600, fontSize: 13, cursor: reported ? "default" : "pointer" }}>{reported ? "✓ Reported" : "Report inactive"}</button>
        </footer>
      </aside>
    </>,
    document.body,
  )
}

/** Whole days between an ISO date and now, or null when unparseable. */
function daysAgo(iso?: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}
