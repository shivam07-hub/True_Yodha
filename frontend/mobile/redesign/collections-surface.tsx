"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type ApplicationResponse, type JobMatch } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { SORTS, type FeedItem, type SortKey } from "@/lib/dashboard/feed-model"
import {
  FOLDER_CHIPS,
  buildClosedView,
  buildCollectionsView,
  buildContinueLane,
  buildMyroFound,
  chipCounts,
  collectionsTriageCtx,
  emptyCopy,
  isApplied,
  isExtSource,
  isMyroSource,
  matchesById,
  splitClosedApps,
  type CollectionChip,
} from "@/lib/collections/model"
import { useMyroSearch } from "@/lib/hooks/use-myro-search"
import { useSavedJobDismissal } from "@/lib/hooks/use-saved-job-dismissal"
import { canDismissSavedApplication } from "@/lib/collections/saved-job-dismissal"
import { useJobPriority } from "@/lib/collections/use-job-priority"
import { useCollectionSnooze } from "@/lib/collections/use-collection-snooze"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { BottomSheet } from "./bottom-sheet"
import { JobDetailSheet, type JobDetailData } from "./job-detail-sheet"
import { ApplyCapturePromptMobile } from "./apply-capture-prompt"
import { AddJobSheet } from "./add-job-sheet"
import { CollectionCard, MyroFoundCard, pulseLine } from "./collection-card"
import { MobileAgentPicks } from "./agent-picks-mobile"
import { matchToRow } from "./job-model"
import { useMobileUI } from "./mobile-ui"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"

/* ══════════════════════════════════════════════════════════════════════════
   CollectionsSurface — the mobile Myro Ops folder. "Myro found" reads the brain
   match stack (jobs.matches) THRESHOLD-split (above-bar here + Agent Picks,
   below-bar → Jobs, rejected hidden); "You added" / "Applied" are the saved-job
   worklist. A Myro Search (the paid run) reveals in place. Journey strip ·
   sort sheet · Job Pulse trust line · add-job. (The "Finish tailoring" lane
   moved to the CV workspace, /cv.)
   ══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_DISMISS_KEY = "mm_collections_journey_dismissed_at"
const JOURNEY_RESURFACE_MS = 7 * 24 * 60 * 60 * 1000 // re-teach the loop after 7 days away

export function CollectionsSurface({ token, initialJobId, openSearch }: { token: string; initialJobId?: string | null; openSearch?: boolean }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { snack, closeSnack } = useMobileUI()
  const { refreshVm, profile, gate: myroSearchGate, run: runMyroSearch, isRefreshing } = useMyroSearch(token)
  const {
    notice: dismissalNotice,
    dismiss: dismissSavedJob,
    undo: undoSavedJobDismissal,
    retry: retrySavedJobDismissal,
  } = useSavedJobDismissal(token)

  const appsQ = useQuery({ queryKey: dataKeys.applications(), queryFn: () => jobsApi.applications(token), enabled: !!token, staleTime: 60 * 1000 })
  const matchesQ = useQuery({ queryKey: dataKeys.jobs(), queryFn: () => jobsApi.matches(token), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const picksQ = useQuery({ queryKey: ["agentPicks", token], queryFn: () => jobsApi.agentPicks(token), enabled: !!token, staleTime: 30 * 60 * 1000 })
  const following = useFollowCompany(token)

  const [chip, setChip] = useState<CollectionChip>("found")
  const [sort, setSort] = useState<SortKey>("fit")
  const [sortOpen, setSortOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(initialJobId ?? null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
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
  const appBy = useMemo(() => {
    const m = new Map<string, ApplicationResponse>()
    for (const a of apps) m.set(a.job_id, a)
    return m
  }, [apps])

  // Pulses hydrate from the FULL candidate set (every saved/applied job + every
  // found match), not just the active chip's visible lane — the closed split
  // has to work no matter which chip is open.
  const trackedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const a of apps) ids.add(a.job_id)
    for (const m of matchesQ.data?.jobs ?? []) ids.add(m.job_id)
    return Array.from(ids)
  }, [apps, matchesQ.data])
  const pulses = usePulses(token, trackedIds)

  // Closed lifecycle: a role whose listing verifies dead moves out of its
  // origin chip into its own Closed chip.
  const { open: openApps, closed: closedApps } = useMemo(() => splitClosedApps(apps, pulses), [apps, pulses])

  const ctx = useMemo(
    () => collectionsTriageCtx(openApps),
    [openApps, following.followedNames, profile],
  )
  const continueItems = useMemo(() => buildContinueLane(openApps, byId), [openApps, byId])
  const dismissedIds = useMemo(() => {
    const s = new Set(matchesQ.data?.dismissed_job_ids ?? [])
    dismissed.forEach(id => s.add(id))
    return s
  }, [matchesQ.data, dismissed])
  const shownElsewhere = useMemo(() => {
    const s = new Set(continueItems.map(it => it.jobId))
    for (const p of picksQ.data?.picks ?? []) s.add(p.job_id)
    return s
  }, [continueItems, picksQ.data])
  const myroFound = useMemo(
    () => buildMyroFound(matchesQ.data?.jobs, dismissedIds, shownElsewhere, pulses),
    [matchesQ.data, dismissedIds, shownElsewhere, pulses],
  )
  const closedView = useMemo(
    () => buildClosedView(closedApps, myroFound.closedMatches, byId),
    [closedApps, myroFound.closedMatches, byId],
  )

  const counts = useMemo(
    () => chipCounts(openApps, myroFound.found.length, closedView.length),
    [openApps, myroFound.found.length, closedView.length],
  )
  const appView = useMemo(
    () => (chip === "added" || chip === "applied" ? buildCollectionsView(openApps, chip, sort, ctx, byId) : null),
    [openApps, chip, sort, ctx, byId],
  )

  const queueApps = useMemo(() => (appView?.queueItems ?? []).map(it => appBy.get(it.jobId)).filter(Boolean) as ApplicationResponse[], [appView, appBy])
  const tailoredN = apps.filter(a => a.cv_badge).length

  // Deep-linked from the Loop Bar "N new" signal (Slice 5) → open the gate once.
  const searchOpened = useRef(false)
  useEffect(() => {
    if (openSearch && !searchOpened.current) { searchOpened.current = true; runMyroSearch() }
  }, [openSearch, runMyroSearch])

  // Fresh-matches nudge on a successful run (mobile: a snack, not particles).
  const firedRef = useRef(false)
  useEffect(() => {
    if (refreshVm.state === "done" && (refreshVm.matchesWritten ?? 0) > 0) {
      if (!firedRef.current) { firedRef.current = true; snack({ msg: "Fresh matches ready" }) }
    } else if (refreshVm.state !== "done") {
      firedRef.current = false
    }
  }, [refreshVm.state, refreshVm.matchesWritten, snack])

  useEffect(() => {
    const notice = dismissalNotice
    if (!notice) return
    const isUndo = notice.kind === "undo"
    snack({
      msg: isUndo
        ? "Removed from Collections"
        : notice.kind === "dismiss-error"
          ? "Couldn’t remove this job"
          : "Couldn’t undo removal",
      action: isUndo ? "Undo" : "Retry",
      ms: 6_000,
      onAction: () => {
        closeSnack()
        if (isUndo) undoSavedJobDismissal()
        else retrySavedJobDismissal()
      },
    })
  }, [closeSnack, dismissalNotice, retrySavedJobDismissal, snack, undoSavedJobDismissal])

  const detailApp = detailId ? appBy.get(detailId) ?? null : null
  const detailMatch = detailId && !detailApp ? byId.get(detailId) ?? null : null
  const applyCapture = useApplyCapture({
    token,
    job: {
      job_id: detailApp?.job_id ?? detailMatch?.job_id ?? "",
      source_url: detailApp?.source_url ?? detailMatch?.source_url ?? null,
      company: detailApp?.company ?? detailMatch?.company ?? null,
      listing_confidence: pulses.get(detailApp?.job_id ?? detailMatch?.job_id ?? "")?.listing_confidence,
    },
    surface: "other",
    intentSurface: "mobile_collections",
    onFindSimilar: () => { setDetailId(null); router.push("/market") },
  })

  const doUnsave = (a: ApplicationResponse) => {
    if (!canDismissSavedApplication(a)) return
    dismissSavedJob(a)
    setDetailId(null)
  }
  // The heart is priority intent, same as desktop — optimistic, so it fills on
  // tap instead of after the round trip.
  const priorityMutation = useJobPriority(token)
  const setPriority = (a: ApplicationResponse, next: boolean) => {
    priorityMutation.mutate({ jobId: a.job_id, prioritized: next })
    snack({ msg: next ? "Priority to apply" : "Priority removed" })
  }
  const snoozeMutation = useCollectionSnooze(token)
  const snooze = (a: ApplicationResponse) => {
    snoozeMutation.mutate(a.job_id)
    snack({ msg: "Snoozed for 3 days" })
  }
  const doShare = (a: ApplicationResponse) => {
    const url = a.source_url ?? ""
    if (url) void navigator.clipboard?.writeText(url).catch(() => {})
    snack({ msg: url ? "Link copied" : "No link on this role" })
  }
  const saveMatch = (jobId: string) => {
    void jobsApi.saveJob(token, jobId).then(() => qc.invalidateQueries({ queryKey: dataKeys.applications() }))
    setDetailId(null)
    snack({ msg: "Saved to Collections" })
  }
  const dismissMatch = (jobId: string) => {
    setDismissed(prev => new Set(prev).add(jobId))
    setDetailId(cur => (cur === jobId ? null : cur))
    void jobsApi.dismissMatchCard(token, jobId).then(() => qc.invalidateQueries({ queryKey: dataKeys.jobs() }))
  }

  // Detail data — a saved application OR an above-bar Myro Found match.
  const detailData: JobDetailData | null = (() => {
    if (detailApp) {
      const row = matchToRow((byId.get(detailApp.job_id)) ?? synthFromApp(detailApp))
      const trust = pulseLine(pulses.get(detailApp.job_id))
      if (trust) { row.verified = trust.text; if (trust.warn) row.checkDetails = true }
      const match = byId.get(detailApp.job_id)
      return {
        row,
        whyFit: match?.llm_explanation ?? (detailApp.job_summary ?? detailApp.job_description ?? "").slice(0, 260),
        matched: detailApp.matched_skills ?? [],
        gaps: detailApp.missing_skills ?? [],
        saved: true,
        prioritized: !!detailApp.is_priority,
        canDismiss: canDismissSavedApplication(detailApp),
        hasApply: !!applyCapture.target.url,
        applyLabel: applyCapture.target.actionLabel ?? undefined,
      }
    }
    if (detailMatch) {
      const row = matchToRow(detailMatch)
      const trust = pulseLine(pulses.get(detailMatch.job_id))
      if (trust) { row.verified = trust.text; if (trust.warn) row.checkDetails = true }
      return {
        row,
        whyFit: detailMatch.llm_explanation ?? (detailMatch.job_summary ?? detailMatch.job_description ?? "").slice(0, 260),
        matched: detailMatch.matched_skills ?? [],
        gaps: detailMatch.missing_skills ?? [],
        saved: false,
        canDismiss: true,
        hasApply: !!applyCapture.target.url,
        applyLabel: applyCapture.target.actionLabel ?? undefined,
      }
    }
    return null
  })()

  const statusChipFor = (a: ApplicationResponse) =>
    isApplied(a) ? "Applied" : a.collection_attention_level ? "Decide" : isExtSource(a.source) ? "Extension" : !isMyroSource(a.source) ? "You added" : ""

  const renderAppCard = (a: ApplicationResponse) => {
    const it = byId.get(a.job_id) ?? synthFromApp(a)
    const row = matchToRow(it)
    const trust = pulseLine(pulses.get(a.job_id))
    if (trust) { row.verified = trust.text; if (trust.warn) row.checkDetails = true }
    return (
      <CollectionCard
        key={a.job_id}
        row={row}
        fitKnown={(byId.get(a.job_id)?.match_score ?? 0) > 0}
        statusChip={statusChipFor(a)}
        tailored={!!a.cv_badge}
        pulse={pulses.get(a.job_id)}
        prioritized={!!a.is_priority}
        onOpen={() => setDetailId(a.job_id)}
        onPriority={canDismissSavedApplication(a) ? (next) => setPriority(a, next) : undefined}
        onShare={() => doShare(a)}
        onTailor={() => router.push(`/cv?jobId=${encodeURIComponent(a.job_id)}`)}
        onOpenCv={() => router.push("/cv")}
        onSnooze={canDismissSavedApplication(a) ? () => snooze(a) : undefined}
      />
    )
  }

  // A dead listing — found, saved, or applied. Nothing left to unsave/tailor
  // toward on the listing itself; Share just copies the dead link for reference.
  const renderClosedItem = (it: FeedItem) => {
    const app = appBy.get(it.jobId)
    const row = matchToRow(it.job)
    return (
      <CollectionCard
        key={it.jobId}
        row={row}
        fitKnown={(it.fit ?? 0) > 0}
        statusChip="Closed"
        tailored={false}
        pulse={pulses.get(it.jobId)}
        prioritized={!!app?.is_priority}
        onOpen={() => setDetailId(it.jobId)}
        onPriority={undefined}
        onShare={() => {
          const url = it.job.source_url ?? ""
          if (url) void navigator.clipboard?.writeText(url).catch(() => {})
          snack({ msg: url ? "Link copied" : "No link on this role" })
        }}
        onTailor={() => router.push(`/cv?jobId=${encodeURIComponent(it.jobId)}`)}
        onOpenCv={() => router.push("/cv")}
      />
    )
  }

  const trulyEmpty = !appsQ.isLoading && !matchesQ.isLoading && apps.length === 0 && (matchesQ.data?.jobs?.length ?? 0) === 0

  return (
    <div data-screen-label="Collections" className="mm-root" style={{ background: "var(--mm-bg)", minHeight: "100%", animation: "mm-screenIn 240ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "10px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: "-0.03em" }}>Collections</h1>
          <div style={{ flex: 1 }} />
          {chip !== "found" && (
            <button onClick={() => setSortOpen(true)} aria-label="Sort" style={{ width: 32, height: 32, borderRadius: 99, border: "none", background: "transparent", color: "var(--mm-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></svg>
            </button>
          )}
          <button onClick={() => setAddOpen(true)} className="mm-press" style={{ height: 32, display: "flex", alignItems: "center", gap: 5, padding: "0 11px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.09)", background: "var(--mm-card)", color: "var(--mm-text)", fontSize: 12.5, fontWeight: 650, cursor: "pointer", fontFamily: "inherit" }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Add
          </button>
        </div>

        {/* journey strip */}
        {!journeyHidden && (
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginTop: 10, background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 13, padding: "9px 6px" }}>
            <JourneyStep label="Browse" sub={`${matchesQ.data?.total ?? "—"} live`} onClick={() => router.push("/market")} done />
            <span style={{ alignSelf: "center", color: "var(--mm-stroke)", fontSize: 11 }}>›</span>
            <JourneyStep label="Collect" sub={`${counts.all} saved`} done />
            <span style={{ alignSelf: "center", color: "var(--mm-stroke)", fontSize: 11 }}>›</span>
            <JourneyStep label="Tailor" sub="the goal" onClick={() => router.push("/cv")} accent={tailoredN} />
            <button onClick={dismissJourney} aria-label="Dismiss" className="tm-dismiss-action" style={{ alignSelf: "flex-start", width: 22, height: 22, marginLeft: 2, flexShrink: 0, borderRadius: 99, border: "none", background: "transparent", color: "var(--mm-dim)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* filter chips */}
        <div className="mm-scroll" style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
          {FOLDER_CHIPS.map(({ key, label }) => {
            const on = chip === key
            return (
              <button key={key} onClick={() => setChip(key)} style={{ flex: "none", height: 28, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 99, border: `1px solid ${on ? "transparent" : "var(--mm-border)"}`, background: on ? "var(--mm-raise-2)" : "transparent", color: on ? "var(--mm-text)" : "var(--mm-muted)", fontSize: 12, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", transition: "background 160ms" }}>
                {label}<span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.65, fontWeight: 600 }}>{counts[key]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* "Finish tailoring" lane moved to the CV workspace (/cv). continueItems
          still feeds Agent-Picks dedup + prefetch above. */}

      <div style={{ padding: "2px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {chip === "found" ? (
          <>
            <MobileAgentPicks token={token} context="collections" />
            {isRefreshing ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderRadius: 13, border: "1px solid rgba(79,199,246,0.2)", background: "var(--mm-accent-wash)", fontSize: 12.5, color: "var(--mm-text-2)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--mm-accent)", animation: "mm-dotBlink 1.1s infinite", flex: "none" }} />
                  {refreshVm.progressLabel ?? "Myro Ops · reading the market"}
                  {refreshVm.progressTotal != null && refreshVm.progressDone != null ? ` · ${refreshVm.progressDone}/${refreshVm.progressTotal}` : ""}
                </div>
                {[0, 1, 2].map(i => <div key={i} style={{ height: 86, borderRadius: 16, background: "var(--mm-card)", border: "1px solid var(--mm-hair)", opacity: 0.55 }} />)}
              </>
            ) : myroFound.found.length > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--mm-faint)", textTransform: "uppercase" }}>
                    Cleared the bar · {myroFound.found.length}
                  </div>
                  <button onClick={runMyroSearch} disabled={isRefreshing} className="mm-press" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "0 4px", border: "none", background: "transparent", color: "var(--mm-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: isRefreshing ? 0.6 : 1 }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                    {isRefreshing ? "Searching…" : "Search again"}
                  </button>
                </div>
                {myroFound.found.map(it => {
                  const row = matchToRow(it.job)
                  const trust = pulseLine(pulses.get(it.jobId))
                  if (trust) { row.verified = trust.text; if (trust.warn) row.checkDetails = true }
                  return (
                    <MyroFoundCard
                      key={it.jobId}
                      row={row}
                      fitKnown={it.fit != null}
                      pulse={pulses.get(it.jobId)}
                      onOpen={() => setDetailId(it.jobId)}
                      onDismiss={() => dismissMatch(it.jobId)}
                      onTailor={() => router.push(`/cv?jobId=${encodeURIComponent(it.jobId)}`)}
                    />
                  )
                })}
                <SplitFooter belowBarCount={myroFound.belowBarCount} rejectedCount={myroFound.rejectedCount} onBrowseJobs={() => router.push("/market")} />
              </>
            ) : trulyEmpty ? (
              <div style={{ textAlign: "center", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 16 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700 }}>Run your first Myro Search</div>
                <div style={{ fontSize: 12.5, color: "var(--mm-faint)", lineHeight: 1.5, maxWidth: "34ch" }}>Myro reads the live market against your CV and fills this folder with the roles that clear its quality bar.</div>
                <button onClick={runMyroSearch} className="mm-press" style={ctaBtn}>Myro Search</button>
              </div>
            ) : (
              <div style={{ padding: "8px 2px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, color: "var(--mm-text-3)" }}>Nothing cleared the bar in your last search.</div>
                <SplitFooter belowBarCount={myroFound.belowBarCount} rejectedCount={myroFound.rejectedCount} onBrowseJobs={() => router.push("/market")} />
              </div>
            )}
          </>
        ) : chip === "closed" ? (
          closedView.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 650 }}>Nothing closed</div>
              <div style={{ fontSize: 12.5, color: "var(--mm-faint)", lineHeight: 1.5 }}>{emptyCopy("closed")}</div>
            </div>
          ) : (
            closedView.map(renderClosedItem)
          )
        ) : queueApps.length === 0 && !appsQ.isLoading ? (
          <div style={{ textAlign: "center", padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Nothing here yet</div>
            <div style={{ fontSize: 12.5, color: "var(--mm-faint)", lineHeight: 1.5 }}>{emptyCopy(chip)}</div>
            <button onClick={() => router.push("/market")} className="mm-press" style={ctaBtn}>Browse jobs</button>
          </div>
        ) : (
          queueApps.map(renderAppCard)
        )}
      </div>

      <JobDetailSheet
        open={!!detailId}
        onClose={() => setDetailId(null)}
        data={detailData}
        token={token}
        onHeart={() => (detailApp ? setPriority(detailApp, !detailApp.is_priority) : detailMatch && saveMatch(detailMatch.job_id))}
        onSkip={() => (detailApp ? doUnsave(detailApp) : detailMatch && dismissMatch(detailMatch.job_id))}
        onTailor={() => { const id = detailApp?.job_id ?? detailMatch?.job_id; if (id) router.push(`/cv?jobId=${encodeURIComponent(id)}`) }}
        onApply={() => { if (applyCapture.target.url) applyCapture.open() }}
        captureSlot={detailApp || detailMatch ? <ApplyCapturePromptMobile capture={applyCapture} /> : null}
      />

      <AddJobSheet open={addOpen} onClose={() => setAddOpen(false)} token={token} onAdded={() => { void qc.invalidateQueries({ queryKey: dataKeys.applications() }); setChip("added") }} snack={snack} closeSnack={closeSnack} onTailor={(jobId) => router.push(`/cv?jobId=${encodeURIComponent(jobId)}`)} />

      {/* Pre-flight gate — opened by the Search button / deep-link; charges the flat run. */}
      {myroSearchGate}

      {/* sort sheet — same axes as desktop (Best next / Best fit / Recent / A–Z) */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} label="Sort">
        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>Sort by</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            {SORTS.map(s => (
              <button key={s.key} onClick={() => { setSort(s.key); setSortOpen(false) }} className="mm-press-sm" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", background: "none", border: "none", borderBottom: "1px solid var(--mm-hair)", color: sort === s.key ? "var(--mm-accent)" : "var(--mm-text)", fontSize: 14, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
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

/** Synthesise a JobMatch shape from an application so a saved row renders the
 *  same card as a real match (mirrors feed-model.synthMatch, mobile-lean). */
function synthFromApp(a: ApplicationResponse): JobMatch {
  return {
    id: a.id, job_id: a.job_id, title: a.title, company: a.company,
    location: a.location ?? null, location_city: a.location_city ?? null,
    location_country: a.location_country ?? null, location_mode: a.location_mode ?? null,
    locations: a.locations ?? [], remote: a.location_mode === "remote", overlap_score: 0,
    match_score: 0, verdict: "checking", is_strong: false, llm_rank: null, llm_explanation: null,
    batch_week: "", source_url: a.source_url ?? null, matched_skills: a.matched_skills ?? [],
    missing_skills: a.missing_skills ?? [], job_summary: a.job_summary ?? null,
    job_description: a.job_description ?? null, date_posted: a.date_posted ?? null,
    seniority_level: a.seniority_level ?? null, work_mode: a.work_mode ?? null,
    min_years_experience: a.min_years_experience ?? null, max_years_experience: a.max_years_experience ?? null,
  }
}

function SplitFooter({ belowBarCount, rejectedCount, onBrowseJobs }: { belowBarCount: number; rejectedCount: number; onBrowseJobs: () => void }) {
  if (belowBarCount === 0 && rejectedCount === 0) return null
  return (
    <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--mm-hair)", display: "flex", flexDirection: "column", gap: 7 }}>
      {belowBarCount > 0 ? (
        <div style={{ fontSize: 12, color: "var(--mm-faint)", lineHeight: 1.5 }}>
          {belowBarCount} more ranked below the bar —{" "}
          <button onClick={onBrowseJobs} style={{ background: "none", border: "none", padding: 0, color: "var(--mm-accent)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>see them in Jobs →</button>
        </div>
      ) : null}
      {rejectedCount > 0 ? (
        <div style={{ fontSize: 12, color: "var(--mm-dim)", lineHeight: 1.5 }}>{rejectedCount} rejected — dead listing, wrong level, or off your deal-breakers.</div>
      ) : null}
    </div>
  )
}

function JourneyStep({ label, sub, onClick, done, accent }: { label: string; sub: string; onClick?: () => void; done?: boolean; accent?: number }) {
  const inner = (
    <>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent != null ? "var(--mm-accent)" : done ? "var(--mm-text-3)" : "var(--mm-faint)", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 14, height: 14, borderRadius: 99, background: accent != null ? "var(--mm-accent-wash)" : "var(--mm-border)", color: accent != null ? "var(--mm-accent)" : "var(--mm-text-3)", fontSize: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", animation: accent != null ? "mm-dotBlink 2.4s infinite" : "none" }}>{accent != null ? accent : "✓"}</span>
        {label}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--mm-dim)", fontVariantNumeric: "tabular-nums" }}>{sub}</span>
    </>
  )
  const style: React.CSSProperties = { flex: 1, border: "none", background: "transparent", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: 0 }
  return onClick ? <button onClick={onClick} style={style}>{inner}</button> : <div style={style}>{inner}</div>
}

const ctaBtn: React.CSSProperties = {
  marginTop: 6, height: 36, padding: "0 16px", borderRadius: 99, border: "none", background: "var(--mm-accent)",
  color: "var(--mm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
}
