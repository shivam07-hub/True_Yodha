/**
 * BaselineView — landing surface for /cv with no jobId.
 *
 * LEFT col: CV Library list — always visible, acts as navigation rail.
 * RIGHT col: default = saved target jobs. When a CV is selected, swaps
 *            to an inline CV viewer (no modal). Escape deselects.
 */
"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ApplicationResponse, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { timeAgo } from "@/lib/cv/version-format"
import { Icon } from "./icons"
import { KindDot } from "./commit-graph"
import { CVRender } from "./cv-render"
import { DownloadCVButton } from "@/components/cv/download-cv-button"
import {
  CVLibraryDrawer,
  formatLibraryDocumentKind,
  formatLibraryDocumentTitle,
  type CVLibraryRow,
} from "./library-drawer"

interface BaselineViewProps {
  token: string
  versions: CVVersion[]
  currentBaseline: CVVersion | null
  cv: CVStructured | null
  profile: UserProfile | null
  onRework: () => void
  onOpenJob: (jobId: string) => void
  focusSkill?: string | null
}

function orderRows(versions: CVVersion[]): CVLibraryRow[] {
  const masters = versions
    .filter(v => v.kind === "baseline_upload")
    .sort((a, b) => b.user_version_number - a.user_version_number)
    .map(v => ({ v, thread: "master" }))

  const threads = new Map<string, CVVersion[]>()
  for (const v of versions) {
    if (v.kind === "baseline_upload") continue
    const key = v.job_id ?? `orphan-${v.id}`
    const arr = threads.get(key)
    if (arr) arr.push(v)
    else threads.set(key, [v])
  }
  const entries: Array<[string, CVVersion[]]> = Array.from(threads.entries())
  // Newest copy first within each job folder.
  entries.forEach(([, arr]) => arr.sort((a, b) => b.user_version_number - a.user_version_number))
  // Folder ordering: folder with the most recent copy first.
  entries.sort((a, b) => {
    const aLast = a[1][0].user_version_number
    const bLast = b[1][0].user_version_number
    return bLast - aLast
  })
  const ordered: CVLibraryRow[] = [...masters]
  entries.forEach(([key, arr]) => arr.forEach(v => ordered.push({ v, thread: key })))
  return ordered
}

function matchPctTone(pct: number): "success" | "accent" | "warning" {
  if (pct >= 75) return "success"
  if (pct >= 60) return "accent"
  return "warning"
}

export function BaselineView({
  token,
  versions,
  currentBaseline,
  cv,
  profile,
  onRework,
  onOpenJob,
  focusSkill,
}: BaselineViewProps) {
  const [selectedVId, setSelectedVId] = useState<number | null>(null)

  // When arriving via ?skill= deeplink, auto-open the current baseline viewer.
  useEffect(() => {
    if (focusSkill && currentBaseline) {
      setSelectedVId(currentBaseline.id)
    }
  // Run once on mount — focusSkill comes from URL, stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => orderRows(versions), [versions])

  const stats = useMemo(() => {
    const companies = new Set(
      versions.filter(v => v.kind !== "baseline_upload" && v.company_name).map(v => v.company_name),
    )
    const jobIds = new Set(
      versions.filter(v => v.kind !== "baseline_upload" && v.job_id).map(v => v.job_id),
    )
    return { total: versions.length, companies: companies.size, jobs: jobIds.size }
  }, [versions])

  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    staleTime: 60_000,
  })

  const activeApplications = useMemo<ApplicationResponse[]>(() => {
    const list = applicationsQuery.data ?? []
    const liveStages: ApplicationResponse["status"][] = ["saved", "applied", "screening", "interviewing", "final_round"]
    return list
      .filter(a => liveStages.includes(a.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
  }, [applicationsQuery.data])

  const selectedVersion = selectedVId == null ? null : versions.find(v => v.id === selectedVId) ?? null

  const contact = useMemo(() => ({
    name: profile?.full_name?.trim() || "Your name",
    title: cv?.experience?.[0]?.role ?? "Add a role headline",
    location: profile?.target_location ?? "",
    email: profile?.email ?? "",
    phone: "",
    linkedin: profile?.linkedin_url ?? "",
  }), [profile, cv])

  // Escape key deselects
  useEffect(() => {
    if (selectedVId === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedVId(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedVId])

  return (
    <>
      <div className="cvb-page-head cvb-fade-in">
        <div>
          <h1 className="cvb-page-title">Your CV Library</h1>
          {stats.jobs === 0 ? (
            <p className="cvb-page-sub">
              Main CV saved.{" "}
              <strong style={{ color: "var(--tm-interactive)", fontWeight: 600 }}>Next: pick a job on the right to tailor for it — takes 5 min.</strong>
            </p>
          ) : (
            <p className="cvb-page-sub">
              {stats.jobs} tailored {stats.jobs === 1 ? "CV" : "CVs"} across {stats.companies} {stats.companies === 1 ? "company" : "companies"}.{" "}
              <span style={{ color: "var(--tm-text-faint)" }}>Add more jobs on the right to keep tailoring.</span>
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/tracker?stage=saved" className="cvb-btn primary">
            <Icon name="target" size={14}/> Pick a target job
            <Icon name="arrow-right" size={14}/>
          </Link>
          <DownloadCVButton
            token={token}
            baseline={currentBaseline}
            cv={cv}
            fullName={profile?.full_name}
            className="cvb-btn"
            label="Download CV"
          />
          <button type="button" className="cvb-btn" onClick={onRework}>
            <Icon name="edit" size={14}/> Update Main CV
          </button>
        </div>
      </div>

      {/* 10-minute guide — only before first tailored CV */}
      {stats.jobs === 0 && <TenMinGuide />}

      <div className="cvb-stats">
        <StatCard label={stats.total === 1 ? "saved CV" : "saved CVs"} value={stats.total} sub="in your library" href="#cv-library"/>
        <StatCard label={stats.companies === 1 ? "company" : "companies"} value={stats.companies} sub="with tailored CVs" href="/tracker"/>
        <StatCard label={stats.jobs === 1 ? "job" : "jobs"} value={stats.jobs} sub="job-specific copies" href="/tracker?stage=saved"/>
        <StatCard
          label="Main CV"
          value={currentBaseline ? `Copy ${currentBaseline.user_version_number}` : "—"}
          sub={currentBaseline ? `Main CV · ${timeAgo(currentBaseline.created_at)}` : "no Main CV"}
          mono
          onClick={currentBaseline ? () => setSelectedVId(currentBaseline.id) : undefined}
        />
      </div>

      <div className="cvb-graph-wrap">
        <CVLibraryDrawer
          rows={rows}
          currentBaselineId={currentBaseline?.id ?? null}
          selectedVId={selectedVId}
          onSelect={setSelectedVId}
        />

        {/* RIGHT: swaps between target jobs list and inline CV viewer */}
        <div className="cvb-graph-col cvb-right-col">
          {selectedVersion && cv ? (
            <CVInlineViewer
              key={selectedVersion.id}
              version={selectedVersion}
              cv={cv}
              contact={contact}
              onClose={() => setSelectedVId(null)}
              onOpenJob={(id) => { setSelectedVId(null); onOpenJob(id) }}
              focusSkill={focusSkill}
            />
          ) : (
            <TargetJobsPanel
              key="jobs"
              applications={activeApplications}
              isLoading={applicationsQuery.isLoading}
              onOpen={onOpenJob}
            />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * TenMinGuide — one-time step tracker shown before the user's first tailored CV.
 * Renders above the stats row. Disappears automatically once stats.jobs > 0.
 */
function TenMinGuide() {
  const steps: { n: string; label: string; time: string; done: boolean }[] = [
    { n: "01", label: "Upload your Main CV", time: "2 min", done: true },
    { n: "02", label: "Pick a job and tailor", time: "5 min", done: false },
    { n: "03", label: "See score — download", time: "3 min", done: false },
  ]
  return (
    <div className="cvb-tenmin-guide cvb-fade-in" role="status" aria-label="10-minute CV progress">
      <div className="cvb-tenmin-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        10-min flow
      </div>
      <ol className="cvb-tenmin-steps" aria-label="Progress">
        {steps.map((s) => (
          <li
            key={s.n}
            className={`cvb-tenmin-step${s.done ? " done" : ""}${!s.done && steps[steps.findIndex(x => !x.done)] === s ? " active" : ""}`}
          >
            <span className="cvb-tenmin-dot" aria-hidden="true">
              {s.done ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <span>{s.n}</span>
              )}
            </span>
            <span className="cvb-tenmin-label">{s.label}</span>
            <span className="cvb-tenmin-time">{s.time}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StatCard({ label, value, sub, mono, href, onClick }: {
  label: string; value: string | number; sub: string; mono?: boolean
  href?: string; onClick?: () => void
}) {
  const inner = (
    <>
      <div className={`cvb-stat-value${mono ? " mono" : ""} tabnum`}>{value}</div>
      <div className="eyebrow" style={{ marginTop: 8 }}>{label}</div>
      <div className="cvb-stat-sub">{sub}</div>
    </>
  )
  if (href) return <Link href={href} className="cvb-stat-card cvb-stat-card-interactive">{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="cvb-stat-card cvb-stat-card-interactive">{inner}</button>
  return <div className="cvb-stat-card">{inner}</div>
}

interface TargetJobsPanelProps {
  applications: ApplicationResponse[]
  isLoading: boolean
  onOpen: (jobId: string) => void
}

function TargetJobsPanel({ applications, isLoading, onOpen }: TargetJobsPanelProps) {
  return (
    <>
      <div className="cvb-section-head" style={{ background: "transparent" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="target" size={14} style={{ color: "var(--tm-interactive)" }}/>
          <span className="eyebrow">target jobs · create tailored CV</span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
          {applications.length} active
        </span>
      </div>

      <div className="cvb-right-col-body">
        {isLoading && (
          <div style={{ padding: 18, fontSize: 12, color: "var(--tm-text-faint)" }}>
            Loading saved jobs…
          </div>
        )}

        {!isLoading && applications.length === 0 && (
          <div className="cvb-jobs-empty">
            <p className="cvb-jobs-empty-lead">
              Find a job you want, save it, then tailor your CV for it here in 5 minutes.
            </p>
            <div className="cvb-jobs-empty-actions">
              <Link href="/home#browse" className="cvb-btn primary sm">
                <Icon name="target" size={13}/> Browse jobs
              </Link>
              <Link href="/tracker?stage=saved" className="cvb-btn sm">
                My tracker →
              </Link>
            </div>
          </div>
        )}

        {applications.map(app => (
          <TargetJobCard key={app.id} app={app} onOpen={() => onOpen(app.job_id)} />
        ))}

        {applications.length > 0 && (
          <Link
            href="/home#browse"
            style={{
              marginTop: 8, padding: 12, border: "1px dashed var(--tm-border-soft)",
              borderRadius: 8, textAlign: "center", fontSize: 11.5, color: "var(--tm-text-faint)",
              textDecoration: "none", display: "block",
            }}
          >
            Browse more in <span style={{ color: "var(--tm-interactive)" }}>Jobs →</span>
          </Link>
        )}
      </div>
    </>
  )
}

interface TargetJobCardProps { app: ApplicationResponse; onOpen: () => void }

function TargetJobCard({ app, onOpen }: TargetJobCardProps) {
  const readinessApprox = matchPctTone(60)
  return (
    <button type="button" className="cvb-job-card" onClick={onOpen}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--tm-text)" }}>
            {app.company ?? "Unknown"}
          </span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--tm-text-faint)" }}>
            · {timeAgo(app.created_at)}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>{app.title}</div>
        <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 3, textTransform: "capitalize" }}>
          stage · {app.status.replace("_", " ")}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        {app.cv_badge && (
          <span className={`cvb-pill ${readinessApprox}`}>
            <span className="mono tabnum">v{app.cv_badge.version_number}</span> CV
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--tm-interactive)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          Tailor CV <Icon name="arrow-right" size={11}/>
        </span>
      </div>
    </button>
  )
}

interface CVInlineViewerProps {
  version: CVVersion
  cv: CVStructured
  contact: { name: string; title: string; location: string; email: string; phone: string; linkedin: string }
  onClose: () => void
  onOpenJob: (jobId: string) => void
  focusSkill?: string | null
}

function CVInlineViewer({ version, cv, contact, onClose, onOpenJob, focusSkill }: CVInlineViewerProps) {
  const isMaster = version.kind === "baseline_upload"
  const kindLabel = formatLibraryDocumentKind(version)
  const titleLabel = formatLibraryDocumentTitle(version)

  return (
    <>
      <div className="cvb-inline-cv-head cvb-fade-in">
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
          <button
            type="button"
            className="cvb-btn ghost sm"
            onClick={onClose}
            aria-label="Back to target jobs"
            style={{ padding: "2px 8px", flexShrink: 0 }}
          >
            <Icon name="chevron-right" size={12} style={{ transform: "rotate(180deg)" }}/>
          </button>
          <KindDot kind={version.kind} inline/>
          <span className="mono" style={{ fontSize: 13, color: "var(--tm-interactive)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {titleLabel}
          </span>
          <span className="cvb-pill" style={{ fontSize: 10, flexShrink: 0 }}>{kindLabel}</span>
        </div>
        {!isMaster && version.job_id && (
          <button
            type="button"
            className="cvb-btn sm"
            onClick={() => onOpenJob(version.job_id!)}
            style={{ flexShrink: 0 }}
          >
            <Icon name="folder" size={11}/> Open tailored CV
          </button>
        )}
      </div>

      <div style={{ padding: "6px 14px 4px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <span style={{ fontSize: 11, color: "var(--tm-text-faint)", fontFamily: "var(--cvb-font-mono)" }}>
          {isMaster
            ? "Main CV · source for every tailored copy"
            : `${version.company_name ?? "Company"} · ${version.job_title ?? "Job"}`}
          {" · "}{timeAgo(version.created_at)}
        </span>
      </div>

      <div className="cvb-inline-cv-body">
        <CVRender cv={cv} contact={contact} focusSkill={focusSkill}/>
      </div>
    </>
  )
}
