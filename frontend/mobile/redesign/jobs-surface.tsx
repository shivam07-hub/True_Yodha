"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type JobFeedItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import type { CareerBand } from "@/lib/api"
import { activeFilterCount, type FeedFilters } from "@/components/market/feed-types"
import { FiltersSheet } from "@/components/market/filters-sheet"
import { useJobFeed } from "@/components/market/use-job-feed"
import { useFeedWarm } from "@/components/market/use-feed-warm"
import { useFeedScope } from "@/lib/hooks/use-feed-scope"
import { useMyroSearch } from "@/lib/hooks/use-myro-search"
import { NewInventoryStrip } from "@/components/jobs/new-inventory-strip"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { JobDetailSheet, type JobDetailData } from "./job-detail-sheet"
import { ApplyCapturePromptMobile } from "./apply-capture-prompt"
import { SwipeCard } from "./swipe-card"
import { feedItemToRow } from "./job-model"
import { MobileAgentPicks } from "./agent-picks-mobile"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   JobsSurface — the handoff Jobs tab: swipe-triage feed over the REAL market
   feed (useJobFeed). Sort (Best fit/Newest) ↔ fit/fresh · server search ·
   hidden-jobs (eye) view with restore · job-detail sheet. Save/Skip drain the
   queue + snack.

   Filtering is NOT re-implemented here. This surface owns the same `FeedFilters`
   object the desktop workspace owns and opens the same <FiltersSheet> (which
   renders as a bottom sheet at ≤600px). Mobile previously carried a private
   two-filter fork that applied client-side and could not reach the server
   filters at all — that is the drift this contract exists to prevent.
   ══════════════════════════════════════════════════════════════════════════ */

const SWIPE_HINT_KEY = "myro_swipe_hint_seen_v1"

export interface JobsSurfaceProps {
  token: string
  targetLocations: string[]
  filters: FeedFilters
  onFiltersChange: (f: FeedFilters) => void
  targetRoles: string[]
  chipCountMap: Record<string, number>
  hasCv: boolean
  primaryCareerBand?: CareerBand | null
  exploredCareerBands?: CareerBand[]
  onExploredCareerBandsChange?: (bands: CareerBand[]) => void
}

export function JobsSurface({
  token, targetLocations, filters, onFiltersChange, targetRoles, chipCountMap, hasCv,
  primaryCareerBand, exploredCareerBands, onExploredCareerBandsChange,
}: JobsSurfaceProps) {
  const router = useRouter()
  const { snack, closeSnack } = useMobileUI()
  // Myro Search (the paid re-vet run) — one shared wiring across every surface.
  const { run: runMyroSearch, tellMyro, isRefreshing, gate: myroSearchGate } = useMyroSearch(token)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState("")
  const [eyeOn, setEyeOn] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)
  const [showSwipeHint, setShowSwipeHint] = useState(false)

  // Peek-hint teaches the swipe gesture once per user, ever — not once per
  // "current top card" (which would replay it after every save/skip).
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.localStorage.getItem(SWIPE_HINT_KEY)) return
    window.localStorage.setItem(SWIPE_HINT_KEY, "1")
    setShowSwipeHint(true)
  }, [])

  const scope = useFeedScope(targetLocations)
  const { allJobs, visibleJobs, total, loading, settled, triage, undo } =
    useJobFeed({ token, filters, q: searchQ, skill: null, scope })
  // Same J1 warm as desktop, through the same hook — a surface that warmed its own
  // way is how desktop and mobile drifted apart before.
  useFeedWarm({ token, filters, q: searchQ, skill: null, scope, settled })
  const filterCount = activeFilterCount(filters)

  const rows = useMemo(() => visibleJobs.map(feedItemToRow), [visibleJobs])
  const detailItem = detailId ? allJobs.find(j => j.job_id === detailId) ?? null : null
  // Apply Transport — arms the liveness capture whenever the user leaves to
  // apply from the detail sheet; careers-search fallback when no portal link.
  const applyCapture = useApplyCapture({
    token,
    job: {
      job_id: detailItem?.job_id ?? "",
      source_url: detailItem?.source_url ?? null,
      company: detailItem?.company_name ?? null,
      listing_confidence: detailItem?.is_stale || detailItem?.is_active === false ? "uncertain" : undefined,
    },
    surface: "job_detail",
    intentSurface: "mobile_jobs",
    onFindSimilar: () => setDetailId(null),
  })

  // The city, not the "+N" label: this line is already the tightest thing on the
  // header row and truncates from the tail.
  const locationLabel = scope.city ?? ""
  // While loading the counts are 0 — don't paint a false "0 of 0 live" that the
  // arriving feed immediately contradicts. Show the location alone until settled.
  const countLine = loading
    ? locationLabel
    : `${rows.length} of ${total || rows.length} live${locationLabel ? ` · ${locationLabel}` : ""}`

  const doSave = (job: JobFeedItem, fromSheet?: boolean) => {
    setShowSwipeHint(false)
    triage(job, "saved")
    if (fromSheet) setDetailId(null)
    snack({ msg: "Saved to Collections", action: "Tailor now", onAction: () => { closeSnack(); router.push(`/cv?jobId=${encodeURIComponent(job.job_id)}`) } })
  }
  const doSkip = (job: JobFeedItem, fromSheet?: boolean) => {
    setShowSwipeHint(false)
    triage(job, "skipped")
    if (fromSheet) setDetailId(null)
    snack({ msg: "Hidden from your feed", action: "Undo", onAction: () => { undo(); closeSnack() } })
  }
  const doShare = (job: JobFeedItem) => {
    const url = job.source_url ?? `${typeof window !== "undefined" ? window.location.origin : ""}/companies`
    void navigator.clipboard?.writeText(url).catch(() => {})
    setSharedId(job.job_id)
    setTimeout(() => setSharedId(null), 1500)
    snack({ msg: "Link copied" })
  }
  const doTailor = (jobId: string) => { setDetailId(null); router.push(`/cv?jobId=${encodeURIComponent(jobId)}`) }
  const doApply = () => {
    if (applyCapture.target.url) applyCapture.open()
    else snack({ msg: "No official opening found" })
  }

  const detailData: JobDetailData | null = detailItem
    ? {
        row: feedItemToRow(detailItem),
        whyFit: (detailItem.job_description ?? "").slice(0, 260),
        matched: detailItem.matched_skills ?? [],
        gaps: (detailItem.skills ?? []).filter(s => !(detailItem.matched_skills ?? []).includes(s)),
        saved: false,
        hasApply: !!applyCapture.target.url,
        applyLabel: applyCapture.target.actionLabel ?? undefined,
      }
    : null

  return (
    <div data-screen-label="Jobs" className="mm-root" style={{ background: "var(--mm-bg)", minHeight: "100%", animation: "mm-screenIn 240ms cubic-bezier(0.16,1,0.3,1)" }}>
      {/* header */}
      <div style={{ padding: "10px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ margin: 0, flex: "none", fontSize: 25, fontWeight: 700, letterSpacing: "-0.03em" }}>Jobs</h1>
          {/* The one shrinkable child on this row, so a long city name can never
              push the Myro Search pill off-screen. Truncates from the tail —
              the counts survive, the location degrades. */}
          <span title={countLine} style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--mm-faint)", fontVariantNumeric: "tabular-nums" }}>{countLine}</span>
          <div style={{ flex: 1 }} />
          {/* Myro Search (the paid run) lives on the header row — it needs the
              width its label deserves. The free in-feed search is a filter and
              sits with the other filters below. */}
          <button onClick={runMyroSearch} disabled={isRefreshing} className="mm-press" title="Run Myro Search" style={{ height: 30, flex: "none", alignSelf: "center", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5, padding: "0 11px", borderRadius: 99, border: "none", background: "var(--mm-accent)", color: "var(--mm-accent-fg)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: isRefreshing ? 0.6 : 1 }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>
            {isRefreshing ? "Searching…" : "Myro Search"}
          </button>
          <button onClick={() => setEyeOn(o => !o)} aria-label="Hidden jobs" style={{ ...roundIcon, alignSelf: "center", background: eyeOn ? "var(--mm-border)" : "transparent", color: eyeOn ? "var(--mm-text)" : "var(--mm-muted)" }}><svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /><path d="M4 4l16 16" /></svg></button>
        </div>

        {searchOpen ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Company or role" autoFocus style={{ flex: 1, height: 36, borderRadius: 10, border: "1px solid var(--mm-border)", background: "var(--mm-card-2)", color: "var(--mm-text)", padding: "0 12px", fontSize: 14, outline: "none", fontFamily: "inherit" }} />
            <button onClick={() => { setSearchOpen(false); setSearchQ("") }} style={{ height: 36, padding: "0 12px", borderRadius: 10, border: "none", background: "transparent", color: "var(--mm-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ display: "flex", flex: "none", background: "var(--mm-raise-1)", borderRadius: 9, padding: 2 }}>
              <SegBtn on={filters.sort === "fit"} onClick={() => onFiltersChange({ ...filters, sort: "fit" })}>Best fit</SegBtn>
              <SegBtn on={filters.sort === "fresh"} onClick={() => onFiltersChange({ ...filters, sort: "fresh" })}>Newest</SegBtn>
            </div>
            <button onClick={() => setFiltersOpen(true)} style={{ height: 32, flex: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 99, border: "1px solid var(--mm-border)", background: "transparent", color: "var(--mm-text-3)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
              {filterCount > 0 ? `Filters · ${filterCount}` : "Filters"}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setSearchOpen(true)} aria-label="Search this feed" style={roundIcon}><svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg></button>
          </div>
        )}
      </div>

      {/* body */}
      <div style={{ padding: "2px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Same new-inventory signal the desktop workspace shows — one component,
            so the two skins can never disagree about whether the user was told
            that Myro is holding roles they've never searched. Renders nothing at
            zero. */}
        {!loading && !isRefreshing ? <NewInventoryStrip token={token} /> : null}
        {/* Curated Agent Picks — default view only (hidden while searching, filtering
            or viewing hidden jobs). Renders nothing when the user has no picks. */}
        {!loading && !eyeOn && !searchQ && filterCount === 0 ? (
          <MobileAgentPicks token={token} context="feed" />
        ) : null}
        {eyeOn ? (
          <HiddenView token={token} snack={snack} />
        ) : loading ? (
          <FeedSkeleton />
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Feed clear 🎯</div>
            <div style={{ fontSize: 12.5, color: "var(--mm-faint)", lineHeight: 1.5 }}>You&apos;ve triaged everything here.<br />Next: tailor a CV for what you saved.</div>
            <button onClick={() => router.push("/collections")} className="mm-press" style={ctaBtn}>Open Collections</button>
            <button onClick={tellMyro} style={intentLink}>Not what you wanted? Tell Myro →</button>
          </div>
        ) : (
          rows.map((row, i) => {
            const job = visibleJobs[i]
            return (
              <SwipeCard
                key={row.id}
                row={row}
                first={i === 0}
                hint={showSwipeHint && i === 0}
                shared={sharedId === row.id}
                onOpen={() => setDetailId(row.id)}
                onSave={() => doSave(job)}
                onSkip={() => doSkip(job)}
                onShare={() => doShare(job)}
              />
            )
          })
        )}
        {/* Delta-4 door. Off the toolbar (it competed with two search
            affordances in a 375px strip) and onto the moment it's actually
            true: a feed too thin to be what the user asked for. */}
        {!eyeOn && rows.length > 0 && rows.length < 5 ? (
          <button onClick={tellMyro} style={{ ...intentLink, alignSelf: "center", marginTop: 2 }}>
            Not what you wanted? Tell Myro →
          </button>
        ) : null}
      </div>

      <JobDetailSheet
        open={!!detailId}
        onClose={() => setDetailId(null)}
        data={detailData}
        token={token}
        onHeart={() => detailItem && doSave(detailItem, true)}
        onSkip={() => detailItem && doSkip(detailItem, true)}
        onTailor={() => detailItem && doTailor(detailItem.job_id)}
        onApply={doApply}
        captureSlot={detailItem ? <ApplyCapturePromptMobile capture={applyCapture} /> : null}
      />

      {/* The SAME sheet the desktop workspace opens — it renders as a bottom
          sheet at ≤600px. Both surfaces therefore expose the identical filter
          set against the identical backend contract. */}
      {filtersOpen ? (
        <FiltersSheet
          filters={filters}
          onChange={onFiltersChange}
          onClose={() => setFiltersOpen(false)}
          targetRoles={targetRoles}
          chipCountMap={chipCountMap}
          hasCv={hasCv}
          scope={scope}
          onEditLocations={() => document.dispatchEvent(new CustomEvent("tm:open-settings", { detail: { tab: "Following" } }))}
          primaryCareerBand={primaryCareerBand}
          exploredCareerBands={exploredCareerBands}
          onExploredCareerBandsChange={onExploredCareerBandsChange}
        />
      ) : null}

      {/* One modal, two landings. `tellMyro` opens it on the say band, `run`
          on the slots — the bottom sheet that used to be a second surface
          against this same Order is gone. */}
      {myroSearchGate}
    </div>
  )
}

function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ height: 28, padding: "0 14px", borderRadius: 7, border: "none", background: on ? "var(--mm-raise-2)" : "transparent", color: on ? "var(--mm-text)" : "var(--mm-faint)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 180ms" }}>
      {children}
    </button>
  )
}

function FeedSkeleton() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 16, padding: 14, height: 128, opacity: 1 - i * 0.18, animation: "mm-stepPulse 1.4s ease infinite" }} />
      ))}
    </>
  )
}

function HiddenView({ token, snack }: { token: string; snack: (s: { msg: string }) => void }) {
  const qc = useQueryClient()
  const hidden = useQuery({ queryKey: dataKeys.hiddenJobs(), queryFn: () => jobsApi.hiddenJobs(token), enabled: !!token })
  const restore = useMutation({
    mutationFn: (jobId: string) => jobsApi.unskipJob(token, jobId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.hiddenJobs() })
      snack({ msg: "Back in your feed" })
    },
  })
  const list = hidden.data ?? []
  return (
    <>
      <div style={{ fontSize: 12, color: "var(--mm-faint)", padding: "2px 2px 4px" }}>Hidden roles stay out of your feed. Restore any time.</div>
      {list.map(row => {
        const co = row.company_name ?? "—"
        return (
          <div key={row.job_id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--mm-raise-1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "var(--mm-text-3)", flex: "none" }}>{co.slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.job_title}</div>
              <div style={{ fontSize: 11.5, color: "var(--mm-faint)" }}>{co}</div>
            </div>
            <button onClick={() => restore.mutate(row.job_id)} className="mm-press-sm" style={{ height: 30, padding: "0 12px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "var(--mm-text)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Restore</button>
          </div>
        )
      })}
      {!hidden.isLoading && list.length === 0 && <div style={{ textAlign: "center", color: "var(--mm-dim)", fontSize: 12.5, padding: "28px 0" }}>Nothing hidden yet.</div>}
    </>
  )
}

const roundIcon: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 99, border: "none", background: "transparent", color: "var(--mm-muted)",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
}
const intentLink: React.CSSProperties = {
  border: "none", background: "transparent", color: "var(--mm-faint)", fontSize: 12, cursor: "pointer",
  fontFamily: "inherit", padding: "6px 4px",
}
const ctaBtn: React.CSSProperties = {
  marginTop: 6, height: 36, padding: "0 16px", borderRadius: 99, border: "none", background: "var(--mm-accent)",
  color: "var(--mm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
}
