/**
 * BaselineView — landing surface for /cv with no jobId.
 *
 * Master CV at the trunk + per-company tailored branches drawn as a Git-style
 * commit graph. Clicking any commit opens a dark CV viewer modal.
 * Right column = saved target jobs that link into the per-job playground.
 */
"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ApplicationResponse, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import {
  formatGlobalVersionLabel,
  timeAgo,
} from "@/lib/cv/version-format"
import { Icon } from "./icons"
import { CommitRow, KindDot, LegendDot } from "./commit-graph"
import { CVRender } from "./cv-render"

interface BaselineViewProps {
  token: string
  versions: CVVersion[]
  currentBaseline: CVVersion | null
  cv: CVStructured | null
  profile: UserProfile | null
  onRework: () => void
  onOpenJob: (jobId: string) => void
}

interface OrderedRow { v: CVVersion; thread: string }

function orderRows(versions: CVVersion[]): OrderedRow[] {
  // Master at top.
  const masters = versions
    .filter(v => v.kind === "baseline_upload")
    .sort((a, b) => b.user_version_number - a.user_version_number)
    .map(v => ({ v, thread: "master" }))

  // Group company versions by job_id thread.
  const threads = new Map<string, CVVersion[]>()
  for (const v of versions) {
    if (v.kind === "baseline_upload") continue
    const key = v.job_id ?? `orphan-${v.id}`
    const arr = threads.get(key)
    if (arr) arr.push(v)
    else threads.set(key, [v])
  }
  // Sort each thread oldest -> newest by user_version_number.
  const entries: Array<[string, CVVersion[]]> = Array.from(threads.entries())
  entries.forEach(([, arr]) => arr.sort((a, b) => a.user_version_number - b.user_version_number))
  // Order threads by their newest entry, newest-first.
  entries.sort((a, b) => {
    const aLast = a[1][a[1].length - 1].user_version_number
    const bLast = b[1][b[1].length - 1].user_version_number
    return bLast - aLast
  })
  const ordered: OrderedRow[] = [...masters]
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
}: BaselineViewProps) {
  const [modalVId, setModalVId] = useState<number | null>(null)

  const rows = useMemo(() => orderRows(versions), [versions])

  const stats = useMemo(() => {
    const companies = new Set(
      versions.filter(v => v.kind !== "baseline_upload" && v.company_name).map(v => v.company_name),
    )
    const jobIds = new Set(
      versions.filter(v => v.kind !== "baseline_upload" && v.job_id).map(v => v.job_id),
    )
    return {
      total: versions.length,
      companies: companies.size,
      jobs: jobIds.size,
    }
  }, [versions])

  // Saved/active applications for the target-jobs panel.
  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    staleTime: 60_000,
  })

  const activeApplications = useMemo<ApplicationResponse[]>(() => {
    const list = applicationsQuery.data ?? []
    // Only stages the user is actively working — outcomes are terminal.
    const liveStages: ApplicationResponse["status"][] = ["saved", "applied", "screening", "interviewing", "final_round"]
    return list
      .filter(a => liveStages.includes(a.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
  }, [applicationsQuery.data])

  const modalVersion = modalVId == null ? null : versions.find(v => v.id === modalVId) ?? null

  const contact = useMemo(() => ({
    name: profile?.full_name?.trim() || "Your name",
    title: cv?.experience?.[0]?.role ?? "Add a role headline",
    location: profile?.target_location ?? "",
    email: profile?.email ?? "",
    phone: "",
    linkedin: profile?.linkedin_url ?? "",
  }), [profile, cv])

  return (
    <>
      <div className="cvb-page-head cvb-fade-in">
        <div>
          <div className="cvb-crumbs" style={{ marginBottom: 2 }}>
            <span>app</span><span className="sep">/</span>
            <span className="accent">cv_builder</span><span className="sep">/</span>
            <span>baseline</span>
          </div>
          <h1 className="cvb-page-title">Your Master CV</h1>
          <p className="cvb-page-sub">
            The trunk. Every job-tailored version branches from here.{" "}
            <span style={{ color: "var(--tm-text-faint)" }}>Tailoring is per-company.</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="cvb-btn" onClick={onRework}>
            <Icon name="edit" size={14}/> Rework baseline
          </button>
          <Link href="/tracker?stage=saved" className="cvb-btn primary">
            <Icon name="target" size={14}/> Pick a target job
            <Icon name="arrow-right" size={14}/>
          </Link>
        </div>
      </div>

      <div className="cvb-stats">
        <StatCard label="versions" value={stats.total} sub="immutable commits"/>
        <StatCard label="companies" value={stats.companies} sub="branches tracked"/>
        <StatCard label="jobs" value={stats.jobs} sub="tailored threads"/>
        <StatCard
          label="master"
          value={currentBaseline ? `v${currentBaseline.user_version_number}` : "—"}
          sub={currentBaseline ? `baseline · ${timeAgo(currentBaseline.created_at)}` : "no baseline"}
          mono
        />
      </div>

      <div className="cvb-graph-wrap">
        <div className="cvb-graph-col">
          <div className="cvb-section-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="git-branch" size={14} style={{ color: "var(--tm-accent)" }}/>
              <span className="eyebrow">commit graph</span>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
              {rows.length} {rows.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div className="cvb-graph-scroll">
            {rows.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
                No commits yet — upload a baseline to begin.
              </div>
            )}
            {rows.map(({ v, thread }, i) => {
              const prev = rows[i - 1]
              const next = rows[i + 1]
              const isFirstOfThread = !prev || prev.thread !== thread
              const isLastOfThread = !next || next.thread !== thread
              const header = isFirstOfThread && v.kind !== "baseline_upload" && (
                <div key={`head-${thread}`} className="cvb-graph-thread-head">
                  <Icon name="git-branch" size={11} style={{ color: "var(--tm-text-faint)" }}/>
                  <span className="eyebrow" style={{ fontSize: 10 }}>
                    branch · {v.company_name ?? "untagged"}
                  </span>
                </div>
              )
              return (
                <div key={v.id}>
                  {header}
                  <CommitRow
                    v={v}
                    isCurrentBaseline={currentBaseline?.id === v.id}
                    selected={modalVId === v.id}
                    onSelect={setModalVId}
                    drawTop={!isFirstOfThread || i > 0}
                    drawBottom={!isLastOfThread}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className="cvb-graph-col" style={{ padding: 16, gap: 14, display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div className="cvb-section-head" style={{ padding: 0, border: "none", background: "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="target" size={14} style={{ color: "var(--tm-accent)" }}/>
              <span className="eyebrow">target jobs · open thread</span>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
              {activeApplications.length} active
            </span>
          </div>

          {applicationsQuery.isLoading && (
            <div style={{ padding: 18, fontSize: 12, color: "var(--tm-text-faint)" }}>
              Loading saved jobs…
            </div>
          )}

          {!applicationsQuery.isLoading && activeApplications.length === 0 && (
            <div style={{
              padding: 18, border: "1px dashed var(--tm-border-soft)", borderRadius: 8,
              textAlign: "center", fontSize: 12, color: "var(--tm-text-faint)",
            }}>
              No active applications yet.{" "}
              <Link href="/tracker?stage=saved" style={{ color: "var(--tm-accent)" }}>Add one →</Link>
            </div>
          )}

          {activeApplications.map(app => (
            <TargetJobCard key={app.id} app={app} onOpen={() => onOpenJob(app.job_id)} />
          ))}

          <Link
            href="/jobs"
            style={{
              marginTop: 8, padding: 12, border: "1px dashed var(--tm-border-soft)",
              borderRadius: 8, textAlign: "center", fontSize: 11.5, color: "var(--tm-text-faint)",
              textDecoration: "none", display: "block",
            }}
          >
            Browse more in <span style={{ color: "var(--tm-accent)" }}>Jobs →</span>
          </Link>
        </div>
      </div>

      <div style={{
        marginTop: 14, display: "flex", gap: 16, fontSize: 11,
        color: "var(--tm-text-faint)", flexWrap: "wrap", alignItems: "center",
      }}>
        <LegendDot cls="master" label="baseline upload"/>
        <LegendDot cls="det" label="deterministic"/>
        <LegendDot cls="polished" label="AI polished"/>
        <LegendDot cls="edited" label="manually edited"/>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="cvb-kbd">click</span> any commit to view its CV
        </span>
      </div>

      <CVViewerModal
        version={modalVersion}
        cv={cv}
        contact={contact}
        onClose={() => setModalVId(null)}
        onOpenJob={(id) => { setModalVId(null); onOpenJob(id) }}
      />
    </>
  )
}

function StatCard({ label, value, sub, mono }: { label: string; value: string | number; sub: string; mono?: boolean }) {
  return (
    <div className="cvb-stat-card">
      <div className={`cvb-stat-value${mono ? " mono" : ""} tabnum`}>{value}</div>
      <div className="eyebrow" style={{ marginTop: 8 }}>{label}</div>
      <div className="cvb-stat-sub">{sub}</div>
    </div>
  )
}

interface TargetJobCardProps {
  app: ApplicationResponse
  onOpen: () => void
}

function TargetJobCard({ app, onOpen }: TargetJobCardProps) {
  const readinessApprox = matchPctTone(60) // tone-only fallback; real % needs jobs.path which we resolve lazily on click
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
        <span style={{ fontSize: 11, color: "var(--tm-accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          Open thread <Icon name="arrow-right" size={11}/>
        </span>
      </div>
    </button>
  )
}

interface CVViewerModalProps {
  version: CVVersion | null
  cv: CVStructured | null
  contact: { name: string; title: string; location: string; email: string; phone: string; linkedin: string }
  onClose: () => void
  onOpenJob: (jobId: string) => void
}

function CVViewerModal({ version, cv, contact, onClose, onOpenJob }: CVViewerModalProps) {
  const open = version !== null && cv !== null
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || !version || !cv) return null

  const isMaster = version.kind === "baseline_upload"
  const kindLabel =
    isMaster ? "Master baseline"
    : version.kind === "polished" ? "AI polished"
    : version.kind === "edited" ? "Manually edited"
    : "Deterministic"
  const titleLabel = version.title?.trim() || (isMaster ? "Master CV" : formatGlobalVersionLabel(version))

  return (
    <div className="cvb-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="CV viewer">
      <div className="cvb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cvb-modal-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
              <KindDot kind={version.kind} inline/>
              <span className="mono" style={{ fontSize: 14, color: "var(--tm-accent)" }}>{titleLabel}</span>
              <span className="cvb-pill" style={{ fontSize: 10 }}>{kindLabel}</span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--tm-text-faint)" }}>
                {formatGlobalVersionLabel(version)}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--tm-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isMaster
                ? "your master baseline · the trunk every job-tailored version branches from"
                : `${version.company_name ?? "Company"} · ${version.job_title ?? "Job"}`}
              {" · "}{timeAgo(version.created_at)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {!isMaster && version.job_id && (
              <button type="button" className="cvb-btn sm" onClick={() => onOpenJob(version.job_id!)}>
                <Icon name="git-branch" size={11}/> Open thread
              </button>
            )}
            <button type="button" className="cvb-btn sm ghost" onClick={onClose} aria-label="Close viewer">
              <Icon name="x" size={14}/>
            </button>
          </div>
        </div>
        <div className="cvb-modal-body">
          <CVRender cv={cv} contact={contact}/>
        </div>
      </div>
    </div>
  )
}
