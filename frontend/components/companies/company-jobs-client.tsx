"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { publicRead } from "@/lib/public-api"
import { formatCount } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { CapturePill } from "@/components/jobs/capture-pill"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromCompanyJob } from "@/lib/jobs/card-view"
import "@/components/jobs/feed-card.css"
import type { CompanyJobCard, CompanyJobsResponse, CompanyReviewItem } from "@/lib/api"
import { ParticleLoading } from "@/components/loading/particle-loading"
import { useSession } from "@/lib/hooks/use-auth"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { CompanySkillDemandPanel } from "./company-skill-demand-panel"

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchCompanyJobs(name: string, page: number): Promise<CompanyJobsResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: "50" })
  return publicRead<CompanyJobsResponse>(
    `/companies/${encodeURIComponent(name)}/jobs?${params}`,
  )
}

async function saveJobReq(token: string, jobId: string): Promise<void> {
  await publicRead(`/jobs/save/${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── Components ────────────────────────────────────────────────────────────────

// The ONE job card (compact density) — identical anatomy to /market and /intel.
// The <h3> role heading is preserved by FeedCard's fc-role (SEO/AI outline); the
// company is the page context so the per-row identity tile is dropped.
function JobRow({
  job, saved, isAuthed, companyName, onSave, onSignUp, onTailor,
}: {
  job: CompanyJobCard
  saved: boolean
  isAuthed: boolean
  companyName: string
  onSave: () => void
  onSignUp: () => void
  onTailor: () => void
}) {
  return (
    <FeedCard
      variant="compact"
      data={feedDataFromCompanyJob(job)}
      actions={
        <CapturePill
          status={!isAuthed ? "signed-out" : saved ? "saved" : "rest"}
          size="sm"
          label={`${job.title} at ${companyName}`}
          onSave={onSave}
          onSignUp={onSignUp}
          onTailor={onTailor}
        />
      }
    />
  )
}

// ── Client surface ─────────────────────────────────────────────────────────────

/**
 * Interactive company-jobs surface. The server page (app/companies/[slug]/page.tsx)
 * fetches the first page and passes it as `initialData`, so this component renders
 * the real job list during SSR (no loading shell in the crawlable HTML). Page 2+,
 * Save and the signup gate stay client-side.
 */
export function CompanyJobsClient({
  companyName,
  initialData,
  notes,
}: {
  companyName: string
  initialData: CompanyJobsResponse | null
  notes: CompanyReviewItem[]
}) {
  const { token } = useSession()
  const signup = useSignupGate()
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["company-jobs", companyName, page],
    queryFn: () => fetchCompanyJobs(companyName, page),
    staleTime: 5 * 60 * 1000,
    // Seed page 1 from the server fetch → first paint = real jobs, not a spinner.
    initialData: page === 1 ? (initialData ?? undefined) : undefined,
  })

  function openSignup(jobId?: string) {
    signup.open({
      surface: "company_jobs_save",
      pendingJobId: jobId ?? null,
    })
  }

  async function handleSave(jobId: string) {
    if (!token) return openSignup(jobId)
    // Optimistic update — ignore errors (job may already be saved)
    setSavedIds(prev => new Set(Array.from(prev).concat(jobId)))
    try { await saveJobReq(token, jobId) } catch { /* already saved */ }
  }

  // Only reached when the server fetch failed AND the client is still loading —
  // crawlers already have the server-rendered title/canonical/JSON-LD above.
  if (isLoading && !data) {
    return (
      <div className="tm-page-canvas" style={{ minHeight: "60vh" }}>
        <ParticleLoading message="Loading company jobs…" height={600} />
      </div>
    )
  }

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const hasNext = data?.has_next ?? false

  return (
    <div className="tm-page-canvas" style={{ color: "var(--tm-text)" }}>

      {/* Hero */}
      <div style={{ borderBottom: "1px solid var(--tm-border-soft)", padding: "32px 32px 28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 60% 0%, var(--tm-int-bg-wash), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 860, margin: "0 auto", position: "relative" }}>
          <Link
            href="/companies"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-caption)", color: "var(--tm-interactive-rest)", textDecoration: "none", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive-rest)" }}
          >
            ← All companies
          </Link>
          <h1 style={{ margin: 0, fontSize: "var(--tm-fs-display)", fontWeight: 600, letterSpacing: "-0.025em", color: "var(--tm-text)", lineHeight: 1 }}>
            {companyName}
          </h1>
          <div style={{ marginTop: 10, fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-caption)", color: "var(--tm-text-faint)" }}>
            {total > 0
              ? `${formatCount(total)} open role${total !== 1 ? "s" : ""}`
              : "No open roles"}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 32px 80px" }}>

        <CompanySkillDemandPanel companyName={companyName} />

        {jobs.length === 0 ? (
          <Button nativeButton={false} render={<Link href="/companies" />} variant="solid" size="md">
            Explore other companies
          </Button>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, opacity: isFetching ? 0.6 : 1, transition: "opacity 200ms" }}>
              {jobs.map(job => (
                <JobRow
                  key={job.job_id}
                  job={job}
                  saved={savedIds.has(job.job_id)}
                  isAuthed={!!token}
                  companyName={companyName}
                  onSave={() => handleSave(job.job_id)}
                  onSignUp={() => openSignup(job.job_id)}
                  onTailor={() => router.push(`/cv?jobId=${encodeURIComponent(job.job_id)}`)}
                />
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

        <CompanyNotes notes={notes} />

        {/* Score CTA — anonymous acquisition only. A logged-in user is already
            in the app, so this signup pitch (wrong-audience copy + a signup
            modal) is hidden for them; experience continuity over a dead CTA. */}
        {!token && (
        <div style={{ marginTop: 48, padding: "28px 32px", background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 0% 50%, var(--tm-int-bg-wash), transparent 50%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: "var(--tm-fs-body)", fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>See how you match {companyName} roles</div>
            <div style={{ fontSize: "var(--tm-fs-body)", color: "var(--tm-text-faint)" }}>Upload your CV. Get a Myro Score + skill gap for every role.</div>
          </div>
          <Button
            nativeButton={false}
            render={<Link href="/signup" />}
            variant="solid"
            size="md"
            style={{ flexShrink: 0, position: "relative" }}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
              e.preventDefault()
              signup.open({ surface: "company_jobs_cta" })
            }}
          >
            Get my Myro Score →
          </Button>
        </div>
        )}

        {/* Internal linking — show crawlers/AI how this page connects to the rest
            of the site (Mueller: "internal links that show how content fits"). */}
        <nav aria-label="Explore more on Myro" style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--tm-border-soft)", display: "flex", flexWrap: "wrap", gap: 18, fontSize: "var(--tm-fs-body)" }}>
          <Link href="/companies" style={{ color: "var(--tm-interactive-rest)", textDecoration: "none", fontWeight: 600 }}>All companies hiring →</Link>
          <Link href="/intel" style={{ color: "var(--tm-interactive-rest)", textDecoration: "none", fontWeight: 600 }}>Live job-market intel →</Link>
          <Link href="/newsletter" style={{ color: "var(--tm-interactive-rest)", textDecoration: "none", fontWeight: 600 }}>Hiring-trend newsletter →</Link>
        </nav>
      </div>
    </div>
  )
}

function CompanyNotes({ notes }: { notes: CompanyReviewItem[] }) {
  if (notes.length === 0) return null
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
      {notes.map((note) => {
        const body = (note.written_note ?? "").trim()
        const stage = note.last_stage
          ? note.last_stage.charAt(0).toUpperCase() + note.last_stage.slice(1)
          : ""
        const author = note.author_ninja_name
        return (
          <div
            key={`${note.created_at}-${author ?? body}`}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--tm-border-soft)" }}
          >
            <p style={{ margin: 0, fontSize: "var(--tm-fs-body)", lineHeight: 1.55, color: "var(--tm-text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {body}
            </p>
            {(author || stage) && (
              <div style={{ marginTop: 7, fontSize: "var(--tm-fs-caption)", color: "var(--tm-text-faint)" }}>
                {author && (
                  <Link href={`/profile/${author}`} style={{ color: "var(--tm-interactive-rest)", fontWeight: 600, textDecoration: "none" }}>
                    {author}
                  </Link>
                )}
                {author && stage ? " · " : null}
                {stage}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
