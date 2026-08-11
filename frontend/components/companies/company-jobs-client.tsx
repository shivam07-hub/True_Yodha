"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { formatCount } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { CapturePill } from "@/components/jobs/capture-pill"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromCompanyJob } from "@/lib/jobs/card-view"
import "@/components/jobs/feed-card.css"
import type { CommentListResponse, CompanyJobCard, CompanyJobsResponse, CompanySkillIntelligence } from "@/lib/api"
import { ParticleLoading } from "@/components/loading/particle-loading"
import { CommentThread } from "@/components/comments/comment-thread"
import { useSession } from "@/lib/hooks/use-auth"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { CompanySkillIntelligenceCard } from "./company-skill-intelligence"

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchCompanyJobs(name: string, page: number): Promise<CompanyJobsResponse> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const params = new URLSearchParams({ page: String(page), page_size: "50" })
  const res = await fetch(`${base}/companies/${encodeURIComponent(name)}/jobs?${params}`)
  if (!res.ok) throw new Error("fetch failed")
  return res.json()
}

export interface PostingNote {
  job_id: string
  role: string | null
  body: string
  author_ninja_name: string | null
  created_at: string
}

// Notes left on this company's job postings, rolled up. The endpoint 404s when
// the company has neither reviews nor notes — treat that as an empty rollup.
async function fetchPostingNotes(name: string): Promise<PostingNote[]> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(`${base}/companies/${encodeURIComponent(name)}`)
  if (res.status === 404) return []
  if (!res.ok) throw new Error("fetch failed")
  const data = await res.json()
  return (data.posting_notes ?? []) as PostingNote[]
}

async function fetchCompanySkillIntelligence(name: string): Promise<CompanySkillIntelligence | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(
    `${base}/companies/${encodeURIComponent(name)}/skill-intelligence?limit=20`,
  )
  if (res.status === 404) return null
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
 * Save, comments, and the signup gate stay client-side.
 */
export function CompanyJobsClient({
  companyName,
  initialData,
  initialComments,
}: {
  companyName: string
  initialData: CompanyJobsResponse | null
  /** Server-fetched company-level notes — seeds the CommentThread into crawlable HTML. */
  initialComments?: CommentListResponse | null
}) {
  const { token } = useSession()
  const signup = useSignupGate()
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [showSkillIntelligence, setShowSkillIntelligence] = useState(false)
  const [showPostingNotes, setShowPostingNotes] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["company-jobs", companyName, page],
    queryFn: () => fetchCompanyJobs(companyName, page),
    staleTime: 5 * 60 * 1000,
    // Seed page 1 from the server fetch → first paint = real jobs, not a spinner.
    initialData: page === 1 ? (initialData ?? undefined) : undefined,
  })

  const {
    data: skillIntelligence,
    isFetching: isFetchingSkillIntelligence,
    isError: isSkillIntelligenceError,
    refetch: refetchSkillIntelligence,
  } = useQuery({
    queryKey: ["company-skill-intelligence", companyName],
    queryFn: () => fetchCompanySkillIntelligence(companyName),
    enabled: showSkillIntelligence,
    staleTime: 5 * 60 * 1000,
  })

  const {
    data: postingNotes,
    isFetching: isFetchingPostingNotes,
    isError: isPostingNotesError,
    refetch: refetchPostingNotes,
  } = useQuery({
    queryKey: ["company-posting-notes", companyName],
    queryFn: () => fetchPostingNotes(companyName),
    enabled: showPostingNotes,
    staleTime: 5 * 60 * 1000,
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
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-interactive-rest)", textDecoration: "none", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive-rest)" }}
          >
            ← All companies
          </Link>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 8 }}>
            LIVE JOB LISTINGS
          </div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--tm-text)", lineHeight: 1 }}>
            {companyName} jobs &amp; hiring signals
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

        {showSkillIntelligence ? (
          isFetchingSkillIntelligence ? (
            <div role="status" className="mb-8 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 text-sm text-[var(--tm-text-faint)]">
              Loading skill demand…
            </div>
          ) : skillIntelligence ? (
            <CompanySkillIntelligenceCard companyName={companyName} data={skillIntelligence} />
          ) : isSkillIntelligenceError ? (
            <div role="alert" className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 text-sm text-[var(--tm-text-faint)]">
              <span>Skill demand could not be loaded.</span>
              <Button type="button" variant="neutral" size="sm" onClick={() => void refetchSkillIntelligence()}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="mb-8 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 text-sm text-[var(--tm-text-faint)]">
              No skill-demand snapshot is available yet.
            </div>
          )
        ) : (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 sm:p-6">
            <div>
              <h2 className="text-balance text-sm font-semibold text-[var(--tm-text)]">
                What skills is {companyName} hiring for?
              </h2>
              <p className="mt-1 text-pretty text-xs text-[var(--tm-text-faint)]">
                Open the latest skill-demand snapshot when you need it.
              </p>
            </div>
            <Button type="button" variant="neutral" size="sm" onClick={() => setShowSkillIntelligence(true)}>
              Show skill demand
            </Button>
          </div>
        )}

        {/* Question-style H2 — structural clarity for crawlers + AI answer engines. */}
        <h2 style={{ margin: "0 0 18px", fontSize: 18, fontWeight: 600, color: "var(--tm-text)" }}>
          What roles is {companyName} hiring for right now?
        </h2>

        {jobs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 48, opacity: 0.08, color: "var(--tm-interactive)" }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>No recent roles tracked for {companyName}</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)", maxWidth: 300, lineHeight: 1.6 }}>
              Our scrapers check regularly. Roles appear here as they&apos;re indexed.
            </div>
            <Button nativeButton={false} render={<Link href="/companies" />} variant="solid" size="md" style={{ marginTop: 8 }}>
              Explore other companies →
            </Button>
          </div>
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

        {/* Public community notes on this company. Anyone reads; signed-in users post. */}
        <div style={{ marginTop: 40, padding: "24px 28px", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 14 }}>
          <div className="tm-label-caps" style={{ color: "var(--tm-text-faint)", marginBottom: 12 }}>
            Notes on {companyName}
          </div>
          <CommentThread token={token ?? null} entityType="company" entityId={companyName} placeholder={`Share what you know about applying to ${companyName}…`} initialData={initialComments ?? undefined} />
        </div>

        {/* J2 rollup: fetch only after the user asks for role-specific notes. */}
        {!showPostingNotes ? (
          <div style={{ marginTop: 24 }}>
            <Button type="button" variant="neutral" size="sm" onClick={() => setShowPostingNotes(true)}>
              Show notes from individual roles
            </Button>
          </div>
        ) : isFetchingPostingNotes ? (
          <div role="status" style={{ marginTop: 24, color: "var(--tm-text-faint)", fontSize: 13 }}>
            Loading role notes…
          </div>
        ) : postingNotes && postingNotes.length > 0 ? (
          <div style={{ marginTop: 24, padding: "24px 28px", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 14 }}>
            <div className="tm-label-caps" style={{ color: "var(--tm-text-faint)", marginBottom: 12 }}>
              From applicants on open roles
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {postingNotes.map((n, i) => (
                <li key={`${n.job_id}-${i}`} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--tm-text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.body}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7, fontSize: 11, color: "var(--tm-text-faint)" }}>
                    {n.role && <span style={{ fontWeight: 600, color: "var(--tm-text-soft, var(--tm-text-faint))" }}>{n.role}</span>}
                    {n.author_ninja_name ? (
                      <Link href={`/profile/${n.author_ninja_name}`} style={{ color: "var(--tm-interactive-rest)", fontWeight: 700, textDecoration: "none" }}>{n.author_ninja_name}</Link>
                    ) : (
                      <span>A Myro user</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : isPostingNotesError ? (
          <div role="alert" style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12, color: "var(--tm-text-faint)", fontSize: 13 }}>
            <span>Role notes could not be loaded.</span>
            <Button type="button" variant="neutral" size="sm" onClick={() => void refetchPostingNotes()}>
              Try again
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 24, color: "var(--tm-text-faint)", fontSize: 13 }}>
            No notes have been shared on individual roles yet.
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
        <nav aria-label="Explore more on Myro" style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--tm-border-soft)", display: "flex", flexWrap: "wrap", gap: 18, fontSize: 13 }}>
          <Link href="/companies" style={{ color: "var(--tm-interactive-rest)", textDecoration: "none", fontWeight: 600 }}>All companies hiring →</Link>
          <Link href="/intel" style={{ color: "var(--tm-interactive-rest)", textDecoration: "none", fontWeight: 600 }}>Live job-market intel →</Link>
          <Link href="/newsletter" style={{ color: "var(--tm-interactive-rest)", textDecoration: "none", fontWeight: 600 }}>Hiring-trend newsletter →</Link>
        </nav>
      </div>
    </div>
  )
}
