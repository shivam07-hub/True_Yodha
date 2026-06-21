"use client"

import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { formatCount } from "@/lib/format"
import { Button } from "@/components/ui/button"
import type { CompanyJobCard, CompanyJobsResponse } from "@/lib/api"
import { formatJobLocation } from "@/lib/format-location"
import { ParticleLoading } from "@/components/loading/particle-loading"
import { CommentThread } from "@/components/comments/comment-thread"
import { useAuth } from "@/lib/hooks/use-auth"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchCompanyJobs(name: string, page: number): Promise<CompanyJobsResponse> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const params = new URLSearchParams({ page: String(page), page_size: "50" })
  const res = await fetch(`${base}/companies/${encodeURIComponent(name)}/jobs?${params}`)
  if (!res.ok) throw new Error("fetch failed")
  return res.json()
}

async function saveJobReq(token: string, jobId: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  await fetch(`${base}/jobs/save/${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function modeLabel(mode: string | null): string | null {
  if (!mode || mode === "unknown") return null
  return ({ onsite: "On-site", remote: "Remote", hybrid: "Hybrid" } as Record<string, string>)[mode] ?? null
}

function locationStr(job: CompanyJobCard): string | null {
  return formatJobLocation({
    location: job.location,
    city: job.location_city,
    country: job.location_country,
  })
}

// ── Components ────────────────────────────────────────────────────────────────

function JobRow({ job, saved, onSave }: { job: CompanyJobCard; saved: boolean; onSave: () => void }) {
  const loc = locationStr(job)
  const mode = modeLabel(job.location_mode)

  return (
    <div style={{
      background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
      borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10,
      transition: "border-color 120ms",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.3, marginBottom: 5 }}>
            {job.title}
          </div>
          {(loc || mode) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>
              {loc && <span>{loc}</span>}
              {mode && (
                <span style={{ color: "var(--tm-text-muted)", background: "var(--tm-hover)", padding: "2px 8px", borderRadius: 99, border: "1px solid var(--tm-border-soft)" }}>
                  {mode}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saved}
          style={{
            flexShrink: 0, padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600,
            background: saved ? "var(--tm-success-wash)" : "var(--tm-int-bg-wash)",
            border: `1px solid ${saved ? "var(--tm-success-border)" : "var(--tm-int-border)"}`,
            color: saved ? "var(--tm-success)" : "var(--tm-interactive)",
            cursor: saved ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            transition: "background 160ms, border-color 160ms, color 160ms",
          }}
        >
          {saved ? "Saved ✓" : "+ Save"}
        </button>
      </div>
      {job.primary_skills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {job.primary_skills.map(s => (
            <span key={s} style={{
              fontSize: 11, padding: "3px 9px", borderRadius: 999,
              background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)",
              color: "var(--tm-interactive)",
            }}>{s}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyJobsPage() {
  const { slug } = useParams<{ slug: string }>()
  const companyName = decodeURIComponent(slug)
  const { token } = useAuth()
  const signup = useSignupGate()
  const [page, setPage] = useState(1)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["company-jobs", companyName, page],
    queryFn: () => fetchCompanyJobs(companyName, page),
    staleTime: 5 * 60 * 1000,
  })

  async function handleSave(jobId: string) {
    if (!token) {
      signup.open({ surface: "company_jobs_save", next: `/companies/${encodeURIComponent(companyName)}` })
      return
    }
    // Optimistic update — ignore errors (job may already be saved)
    setSavedIds(prev => new Set(Array.from(prev).concat(jobId)))
    try { await saveJobReq(token, jobId) } catch { /* already saved */ }
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--tm-bg)" }}>
        <ParticleLoading message="Loading company jobs…" height={600} />
      </div>
    )
  }

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const hasNext = data?.has_next ?? false

  return (
    <div style={{ minHeight: "100vh", background: "var(--tm-bg)", color: "var(--tm-text)" }}>

      {/* Hero */}
      <div style={{ borderBottom: "1px solid var(--tm-border-soft)", padding: "32px 32px 28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 60% 0%, var(--tm-int-bg-wash), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 860, margin: "0 auto", position: "relative" }}>
          <Link
            href="/market"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-interactive-rest)", textDecoration: "none", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive-rest)" }}
          >
            ← Live Career Intel
          </Link>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 8 }}>
            LIVE JOB LISTINGS
          </div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--tm-text)", lineHeight: 1 }}>
            {companyName}
          </h1>
          <div style={{ marginTop: 10, fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)" }}>
            {total > 0
              ? `${formatCount(total)} open role${total !== 1 ? "s" : ""} indexed`
              : "No recent roles indexed"}
            <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
            from Myro&apos;s job database
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 32px 80px" }}>

        {jobs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 48, opacity: 0.08, color: "var(--tm-interactive)" }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>No recent roles tracked for {companyName}</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)", maxWidth: 300, lineHeight: 1.6 }}>
              Our scrapers check regularly. Roles appear here as they&apos;re indexed.
            </div>
            <Button render={<Link href="/market" />} variant="solid" size="md" style={{ marginTop: 8 }}>
              Explore other companies →
            </Button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, opacity: isFetching ? 0.6 : 1, transition: "opacity 200ms" }}>
              {jobs.map(job => (
                <JobRow key={job.job_id} job={job} saved={savedIds.has(job.job_id)} onSave={() => handleSave(job.job_id)} />
              ))}
            </div>
            {hasNext && (
              <div style={{ textAlign: "center" }}>
                <Button type="button" variant="neutral" size="md" onClick={() => setPage(p => p + 1)}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}

        {/* Private notes — logged-in only (RLS own-only) */}
        {token && (
          <div style={{ marginTop: 40, padding: "24px 28px", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 14 }}>
            <div className="tm-label-caps" style={{ color: "var(--tm-text-faint)", marginBottom: 12 }}>
              Your notes on {companyName}
            </div>
            <CommentThread token={token} entityType="company" entityId={companyName} placeholder={`Private note on ${companyName} — what you've heard, applied to, want to track…`} />
          </div>
        )}

        {/* Score CTA — anonymous acquisition only. A logged-in user is already
            in the app, so this signup pitch (wrong-audience copy + a signup
            modal) is hidden for them; experience continuity over a dead CTA. */}
        {!token && (
        <div style={{ marginTop: 48, padding: "28px 32px", background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 0% 50%, var(--tm-int-bg-wash), transparent 50%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>See how you match {companyName} roles</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>Upload your CV. Get a Myro Score + skill gap for every role.</div>
          </div>
          <Button
            render={<Link href="/signup?next=/cv?upload=1" />}
            variant="solid"
            size="md"
            style={{ flexShrink: 0, position: "relative" }}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
              e.preventDefault()
              signup.open({ surface: "company_jobs_cta", next: "/cv?upload=1" })
            }}
          >
            Get my Myro Score →
          </Button>
        </div>
        )}
      </div>
    </div>
  )
}
