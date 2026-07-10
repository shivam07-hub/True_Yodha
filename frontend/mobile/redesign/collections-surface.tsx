"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, users as usersApi, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { SORTS, type SortKey } from "@/lib/dashboard/feed-model"
import {
  COLLECTION_CHIPS,
  appToFeedItem,
  buildCollectionsView,
  chipCounts,
  collectionsTriageCtx,
  emptyCopy,
  isApplied,
  isExtSource,
  isMyroSource,
  matchesById,
  type CollectionChip,
} from "@/lib/collections/model"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { BottomSheet } from "./bottom-sheet"
import { JobDetailSheet, type JobDetailData } from "./job-detail-sheet"
import { ApplyCapturePromptMobile } from "./apply-capture-prompt"
import { AddJobSheet } from "./add-job-sheet"
import { CollectionCard, pulseLine } from "./collection-card"
import { MobileAgentPicks } from "./agent-picks-mobile"
import { matchToRow } from "./job-model"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   CollectionsSurface — the handoff Collections tab over REAL saved jobs
   (jobs.applications). Journey strip · pinned "Finish tailoring" lane ·
   source/status chips · triage order (prize×winnability, ported from the
   retired /home dashboard) with a sort sheet · Job Pulse trust line ·
   Tailor CV / Tailored ✓ · add-job sheet (link → extract, JD-paste fallback).
   ══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_DISMISS_KEY = "mm_collections_journey_dismissed_at"
const JOURNEY_RESURFACE_MS = 7 * 24 * 60 * 60 * 1000 // re-teach the loop after 7 days away

export function CollectionsSurface({ token, initialJobId }: { token: string; initialJobId?: string | null }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { snack, closeSnack } = useMobileUI()

  const appsQ = useQuery({ queryKey: dataKeys.applications(), queryFn: () => jobsApi.applications(token), enabled: !!token, staleTime: 60 * 1000 })
  const matchesQ = useQuery({ queryKey: ["jobs", "matches"], queryFn: () => jobsApi.matches(token), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const { data: followed } = useQuery({ queryKey: ["followedCompanies", token], queryFn: () => usersApi.followedCompanies(token), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const { data: profile } = useQuery({ queryKey: dataKeys.profile(), queryFn: () => usersApi.me(token), enabled: !!token, staleTime: 10 * 60 * 1000 })

  const [chip, setChip] = useState<CollectionChip>("all")
  const [sort, setSort] = useState<SortKey>("prize")
  const [sortOpen, setSortOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(initialJobId ?? null)
  const [refreshing, setRefreshing] = useState(false)
  const [journeyHidden, setJourneyHidden] = useState(() => {
    if (typeof window === "undefined") return false
    const at = Number(window.localStorage.getItem(JOURNEY_DISMISS_KEY))
    return at > 0 && Date.now() - at < JOURNEY_RESURFACE_MS
  })
  const dismissJourney = () => {
    setJourneyHidden(true)
    try { window.localStorage.setItem(JOURNEY_DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
  }

  const apps = useMemo(() => appsQ.data ?? [], [appsQ.data])
  const byId = useMemo(() => matchesById(matchesQ.data?.jobs), [matchesQ.data])
  const counts = useMemo(() => chipCounts(apps), [apps])
  const appBy = useMemo(() => {
    const m = new Map<string, ApplicationResponse>()
    for (const a of apps) m.set(a.job_id, a)
    return m
  }, [apps])

  const ctx = useMemo(
    () => collectionsTriageCtx(apps, (followed?.companies ?? []).map(c => c.company_name), profile?.target_roles ?? []),
    [apps, followed, profile],
  )
  const view = useMemo(() => buildCollectionsView(apps, chip, sort, ctx, byId), [apps, chip, sort, ctx, byId])

  const shownIds = useMemo(
    () => [...view.continueItems, ...view.queueItems].map(it => it.jobId),
    [view],
  )
  const pulses = usePulses(token, shownIds)

  const tailoredN = apps.filter(a => a.cv_badge).length

  const detailApp = detailId ? appBy.get(detailId) ?? null : null
  const applyCapture = useApplyCapture({
    token,
    job: { job_id: detailApp?.job_id ?? "", source_url: detailApp?.source_url ?? null, company: detailApp?.company ?? null },
    surface: "other",
    onFindSimilar: () => { setDetailId(null); router.push("/market") },
  })

  const remove = useMutation({
    mutationFn: (jobId: string) => jobsApi.removeTrackerJob(token, jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dataKeys.applications() }),
  })
  const doUnsave = (a: ApplicationResponse) => {
    remove.mutate(a.job_id)
    setDetailId(null)
    snack({ msg: "Removed from Collections", action: "Undo", onAction: () => { void jobsApi.saveJob(token, a.job_id).then(() => qc.invalidateQueries({ queryKey: dataKeys.applications() })); closeSnack() } })
  }
  const doShare = (a: ApplicationResponse) => {
    const url = a.source_url ?? ""
    if (url) void navigator.clipboard?.writeText(url).catch(() => {})
    snack({ msg: url ? "Link copied" : "No link on this role" })
  }
  const doRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    void Promise.all([appsQ.refetch(), matchesQ.refetch()]).finally(() => {
      setTimeout(() => { setRefreshing(false); snack({ msg: "Fresh — every link re-verified today" }) }, 600)
    })
  }

  // Rows render from the FeedItem's job (the REAL match when the brain has
  // evaluated it, synthMatch otherwise) + the live pulse for the trust line.
  const rowFor = (jobId: string) => {
    const it = [...view.continueItems, ...view.queueItems].find(x => x.jobId === jobId)
      ?? (appBy.get(jobId) ? appToFeedItem(appBy.get(jobId)!, byId.get(jobId)) : null)
    if (!it) return null
    const row = matchToRow(it.job)
    const trust = pulseLine(pulses.get(jobId))
    if (trust) {
      row.verified = trust.text
      if (trust.warn) row.checkDetails = true
    }
    return { row, fitKnown: it.fit != null }
  }

  const detailData: JobDetailData | null = detailApp
    ? (() => {
        const r = rowFor(detailApp.job_id)
        if (!r) return null
        const match = byId.get(detailApp.job_id)
        return {
          row: r.row,
          whyFit: match?.llm_explanation ?? (detailApp.job_summary ?? detailApp.job_description ?? "").slice(0, 260),
          matched: detailApp.matched_skills ?? [],
          gaps: detailApp.missing_skills ?? [],
          saved: true,
          hasApply: !!applyCapture.target.url,
        }
      })()
    : null

  const statusChipFor = (a: ApplicationResponse) =>
    isApplied(a) ? "Applied" : isExtSource(a.source) ? "Extension" : !isMyroSource(a.source) ? "You added" : ""

  const renderCard = (a: ApplicationResponse) => {
    const r = rowFor(a.job_id)
    if (!r) return null
    return (
      <CollectionCard
        key={a.job_id}
        row={r.row}
        fitKnown={r.fitKnown}
        statusChip={statusChipFor(a)}
        tailored={!!a.cv_badge}
        pulse={pulses.get(a.job_id)}
        onOpen={() => setDetailId(a.job_id)}
        onHeart={() => doUnsave(a)}
        onShare={() => doShare(a)}
        onTailor={() => router.push(`/cv?jobId=${encodeURIComponent(a.job_id)}`)}
        onOpenCv={() => router.push("/cv")}
      />
    )
  }

  const continueApps = view.continueItems.map(it => appBy.get(it.jobId)).filter(Boolean) as ApplicationResponse[]
  const queueApps = view.queueItems.map(it => appBy.get(it.jobId)).filter(Boolean) as ApplicationResponse[]

  return (
    <div data-screen-label="Collections" className="mm-root" style={{ background: "var(--mm-bg)", minHeight: "100%", animation: "mm-screenIn 240ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "10px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: "-0.03em" }}>Collections</h1>
          <div style={{ flex: 1 }} />
          <button onClick={() => setSortOpen(true)} aria-label="Sort" style={{ width: 32, height: 32, borderRadius: 99, border: "none", background: "transparent", color: "#a6a69e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></svg>
          </button>
          <button onClick={doRefresh} aria-label="Refresh" style={{ width: 32, height: 32, borderRadius: 99, border: "none", background: "transparent", color: "#a6a69e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", animation: refreshing ? "mm-spin 0.9s linear infinite" : "none" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.6" /><path d="M20 5v6h-6" /></svg>
          </button>
          <button onClick={() => setAddOpen(true)} className="mm-press" style={{ height: 32, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.09)", background: "#212120", color: "#f2f2ee", fontSize: 12.5, fontWeight: 650, cursor: "pointer", fontFamily: "inherit" }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Add job
          </button>
        </div>

        {/* journey strip */}
        {!journeyHidden && (
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginTop: 10, background: "#212120", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 13, padding: "9px 6px" }}>
            <JourneyStep label="Browse" sub={`${matchesQ.data?.total ?? "—"} live`} onClick={() => router.push("/market")} done />
            <span style={{ alignSelf: "center", color: "#4a4a45", fontSize: 11 }}>›</span>
            <JourneyStep label="Collect" sub={`${counts.all} saved`} done />
            <span style={{ alignSelf: "center", color: "#4a4a45", fontSize: 11 }}>›</span>
            <JourneyStep label="Tailor" sub="the goal" onClick={() => router.push("/cv")} accent={tailoredN} />
            <button onClick={dismissJourney} aria-label="Dismiss" style={{ alignSelf: "flex-start", width: 22, height: 22, marginLeft: 2, flexShrink: 0, borderRadius: 99, border: "none", background: "transparent", color: "#6a6a63", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* filter chips */}
        <div className="mm-scroll" style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
          {COLLECTION_CHIPS.map(({ key, label }) => {
            const on = chip === key
            return (
              <button key={key} onClick={() => setChip(key)} style={{ flex: "none", height: 28, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 99, border: `1px solid ${on ? "transparent" : "rgba(255,255,255,0.08)"}`, background: on ? "#3a3a36" : "transparent", color: on ? "#f2f2ee" : "#a6a69e", fontSize: 12, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", transition: "background 160ms" }}>
                {label}<span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.65, fontWeight: 600 }}>{counts[key]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* finish-tailoring lane — tailored but not applied, one step from done */}
      {continueApps.length > 0 && (
        <div style={{ padding: "0 16px 4px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "#8b8b84", textTransform: "uppercase", marginBottom: 6 }}>
            Finish tailoring · {continueApps.length}
          </div>
          <div className="mm-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
            {continueApps.map(a => (
              <button key={a.job_id} onClick={() => setDetailId(a.job_id)} className="mm-press" style={{ flex: "none", maxWidth: 220, textAlign: "left", background: "#212120", border: "1px solid rgba(0,245,212,0.22)", borderRadius: 13, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ display: "block", fontSize: 11, fontWeight: 650, color: "#c9c9c2", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.company ?? "Untitled company"}</span>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 650, color: "#f2f2ee", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</span>
                <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "var(--mm-accent)", marginTop: 3 }}>Finish &amp; apply →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: "2px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Curated Agent Picks above the saved worklist (default "All" view). */}
        {chip === "all" ? <MobileAgentPicks token={token} context="collections" /> : null}
        {queueApps.length === 0 && continueApps.length === 0 && !appsQ.isLoading ? (
          <div style={{ textAlign: "center", padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Nothing here yet</div>
            <div style={{ fontSize: 12.5, color: "#8b8b84", lineHeight: 1.5 }}>{emptyCopy(chip)}</div>
            <button onClick={() => router.push("/market")} className="mm-press" style={ctaBtn}>Browse jobs</button>
          </div>
        ) : (
          queueApps.map(renderCard)
        )}
      </div>

      <JobDetailSheet
        open={!!detailId}
        onClose={() => setDetailId(null)}
        data={detailData}
        token={token}
        onHeart={() => detailApp && doUnsave(detailApp)}
        onSkip={() => detailApp && doUnsave(detailApp)}
        onTailor={() => detailApp && router.push(`/cv?jobId=${encodeURIComponent(detailApp.job_id)}`)}
        onApply={() => { if (applyCapture.target.url) applyCapture.open() }}
        captureSlot={detailApp ? <ApplyCapturePromptMobile capture={applyCapture} /> : null}
        onPractice={() => setDetailId(null)}
      />

      <AddJobSheet open={addOpen} onClose={() => setAddOpen(false)} token={token} onAdded={() => { void qc.invalidateQueries({ queryKey: dataKeys.applications() }); setChip("added") }} snack={snack} closeSnack={closeSnack} onTailor={(jobId) => router.push(`/cv?jobId=${encodeURIComponent(jobId)}`)} />

      {/* sort sheet — same axes as desktop (Best next / Best fit / Recent / A–Z) */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} label="Sort">
        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>Sort by</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            {SORTS.map(s => (
              <button key={s.key} onClick={() => { setSort(s.key); setSortOpen(false) }} className="mm-press-sm" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", color: sort === s.key ? "var(--mm-accent)" : "#f2f2ee", fontSize: 14, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ flex: 1 }}>{s.label}</span>
                {sort === s.key && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

function JourneyStep({ label, sub, onClick, done, accent }: { label: string; sub: string; onClick?: () => void; done?: boolean; accent?: number }) {
  const inner = (
    <>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent != null ? "var(--mm-accent)" : done ? "#c9c9c2" : "#8b8b84", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 14, height: 14, borderRadius: 99, background: accent != null ? "var(--mm-accent-wash)" : "rgba(255,255,255,0.08)", color: accent != null ? "var(--mm-accent)" : "#c9c9c2", fontSize: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", animation: accent != null ? "mm-dotBlink 2.4s infinite" : "none" }}>{accent != null ? accent : "✓"}</span>
        {label}
      </span>
      <span style={{ fontSize: 10.5, color: "#71716a", fontVariantNumeric: "tabular-nums" }}>{sub}</span>
    </>
  )
  const style: React.CSSProperties = { flex: 1, border: "none", background: "transparent", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: 0 }
  return onClick ? <button onClick={onClick} style={style}>{inner}</button> : <div style={style}>{inner}</div>
}

const ctaBtn: React.CSSProperties = {
  marginTop: 6, height: 36, padding: "0 16px", borderRadius: 99, border: "none", background: "var(--mm-accent)",
  color: "var(--mm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
}
