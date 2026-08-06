"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"
import "@/components/dashboard/dashboard.css"
import "@/app/(authed)/home/mission-control.css"
import "./collections.css"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { DashboardJobDrawer } from "@/components/dashboard/job-drawer"
import { AgentPicksBand } from "@/components/jobs/agent-picks-band"
import { MatchVettingBanner } from "@/components/jobs/matches-refresh-banner"
import { useMyroSearch } from "@/lib/hooks/use-myro-search"
import { useParticleMoment } from "@/components/particle"
import { SortMenu } from "@/components/dashboard/sort-menu"
import { PeekSurfaces } from "@/components/mission-control/peek-surfaces"
import { FirstSuccessChecklist } from "@/components/onboarding/first-success-checklist"
import { useManualAdd, ADD_JOB_LABEL } from "@/components/cv/pipeline/useManualAdd"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useSavedJobDismissal } from "@/lib/hooks/use-saved-job-dismissal"
import { useCartStore } from "@/store/cartStore"
import { jobs as jobsApi, users as usersApi } from "@/lib/api"
import type { ApplicationResponse, SkillGapItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { withLocalCache, userCacheKey } from "@/lib/local-cache"
import { JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"
import type { FeedItem, SortKey } from "@/lib/dashboard/feed-model"
import {
  FOLDER_CHIPS,
  appToFeedItem,
  buildClosedView,
  buildCollectionsView,
  buildContinueLane,
  buildMyroFound,
  chipCounts,
  collectionsTriageCtx,
  emptyCopy,
  matchesById,
  splitClosedApps,
  type CollectionChip,
} from "@/lib/collections/model"
import { ClosedRow, CollectionRow, MyroFoundRow } from "./collection-rows"
import { canDismissSavedApplication } from "@/lib/collections/saved-job-dismissal"

/* ══════════════════════════════════════════════════════════════════════════
   The Myro Ops folder (desktop). "Myro found" reads the brain match stack —
   threshold-split (above-bar here, below-bar → Jobs, rejected hidden) with the
   Agent Picks pinned above and an honest split footer. "You added" / "Applied"
   are the saved-job worklist. A Myro Search (the paid run) reveals in place.
   ══════════════════════════════════════════════════════════════════════════ */

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

export function CollectionsDesktop({
  token,
  initialJobId,
  openSearch,
}: {
  token: string
  initialJobId?: string | null
  openSearch?: boolean
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const { skills: cartSkills, addSkill, removeSkill } = useCartStore()
  // Shared Myro Search wiring (VM + profile + gate) — one source across surfaces.
  const { refreshVm, profile, gate: myroSearchGate, run: runMyroSearch, isRefreshing } = useMyroSearch(token)
  const savedJobDismissal = useSavedJobDismissal(token)
  const fireMoment = useParticleMoment()

  const appsQ = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const matchesQ = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () =>
      withLocalCache(userCacheKey(token, JOB_MATCHES_CACHE_PARTS), MATCHES_TTL, () => jobsApi.matches(token)),
    enabled: !!token,
    staleTime: MATCHES_TTL,
  })
  const picksQ = useQuery({
    queryKey: ["agentPicks", token],
    queryFn: () => jobsApi.agentPicks(token),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
  })
  const { data: followed } = useQuery({
    queryKey: ["followedCompanies", token],
    queryFn: () => usersApi.followedCompanies(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const [chip, setChip] = React.useState<CollectionChip>("found")
  const [sort, setSort] = React.useState<SortKey>("prize")
  const [openId, setOpenId] = React.useState<string | null>(initialJobId ?? null)
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())

  const addJob = useManualAdd({
    token,
    onSaved: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.applications() })
      setChip("added")
    },
  })

  const apps = React.useMemo(() => appsQ.data ?? [], [appsQ.data])
  const byId = React.useMemo(() => matchesById(matchesQ.data?.jobs), [matchesQ.data])
  const appByJobId = React.useMemo(() => {
    const m = new Map<string, ApplicationResponse>()
    for (const a of apps) m.set(a.job_id, a)
    return m
  }, [apps])

  // Pulses hydrate from the FULL candidate set (every saved/applied job + every
  // found match) — not just the active chip's visible lane — so the closed
  // split works no matter which chip the user is looking at.
  const trackedIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const a of apps) ids.add(a.job_id)
    for (const m of matchesQ.data?.jobs ?? []) ids.add(m.job_id)
    return Array.from(ids)
  }, [apps, matchesQ.data])
  const pulses = usePulses(token, trackedIds)

  // Closed lifecycle: a role whose listing verifies dead moves out of its
  // origin chip (found / added / applied) into its own Closed chip — never
  // deleted, never left full-weight in the primary lists forever.
  const { open: openApps, closed: closedApps } = React.useMemo(
    () => splitClosedApps(apps, pulses),
    [apps, pulses],
  )

  const ctx = React.useMemo(
    () =>
      collectionsTriageCtx(
        openApps,
        (followed?.companies ?? []).map((c) => c.company_name),
        profile?.target_roles ?? [],
      ),
    [openApps, followed, profile],
  )

  const continueItems = React.useMemo(() => buildContinueLane(openApps, ctx, byId), [openApps, ctx, byId])
  const dismissedIds = React.useMemo(() => {
    const s = new Set(matchesQ.data?.dismissed_job_ids ?? [])
    dismissed.forEach((id) => s.add(id))
    return s
  }, [matchesQ.data, dismissed])
  const shownElsewhere = React.useMemo(() => {
    const s = new Set(continueItems.map((it) => it.jobId))
    for (const p of picksQ.data?.picks ?? []) s.add(p.job_id)
    return s
  }, [continueItems, picksQ.data])
  const myroFound = React.useMemo(
    () => buildMyroFound(matchesQ.data?.jobs, dismissedIds, shownElsewhere, pulses),
    [matchesQ.data, dismissedIds, shownElsewhere, pulses],
  )
  const closedView = React.useMemo(
    () => buildClosedView(closedApps, myroFound.closedMatches, byId),
    [closedApps, myroFound.closedMatches, byId],
  )

  const counts = React.useMemo(
    () => chipCounts(openApps, myroFound.found.length, closedView.length),
    [openApps, myroFound.found.length, closedView.length],
  )
  const appView = React.useMemo(
    () => (chip === "added" || chip === "applied" ? buildCollectionsView(openApps, chip, sort, ctx, byId) : null),
    [openApps, chip, sort, ctx, byId],
  )

  // The open drawer can point at a found match, a saved application, or a
  // closed row.
  const openable = React.useMemo(() => {
    const map = new Map<string, FeedItem>()
    for (const it of [...continueItems, ...myroFound.found, ...(appView?.queueItems ?? []), ...closedView]) {
      if (!map.has(it.jobId)) map.set(it.jobId, it)
    }
    // A deep-linked saved role (e.g. from a bell decision prompt) must always be
    // openable, even when the active chip filters it out of every lane — otherwise
    // the drawer silently never opens and the prompt looks like it did nothing.
    if (openId && !map.has(openId)) {
      const app = appByJobId.get(openId)
      if (app) map.set(openId, appToFeedItem(app, byId.get(openId)))
    }
    return Array.from(map.values())
  }, [continueItems, myroFound.found, appView, closedView, openId, appByJobId, byId])
  React.useEffect(() => {
    if (openId && !openable.some((it) => it.jobId === openId)) setOpenId(null)
  }, [openable, openId])
  const openItem = openable.find((it) => it.jobId === openId) ?? null
  const openIsSavedApp = openItem ? appByJobId.has(openItem.jobId) : false
  const openApplication = openItem ? appByJobId.get(openItem.jobId) : undefined
  const openCanDismiss = openApplication ? canDismissSavedApplication(openApplication) : true

  const cartSkillNames = React.useMemo(() => new Set(cartSkills.map((c) => c.skill_name)), [cartSkills])

  // ── Saved intent → immediate Not Interested, with serialized 6s Undo.
  const unsave = (jobId: string) => {
    const app = appByJobId.get(jobId)
    if (!app || !canDismissSavedApplication(app)) return
    savedJobDismissal.dismiss(app)
    setOpenId((cur) => (cur === jobId ? null : cur))
  }
  const snooze = (jobId: string) => {
    void jobsApi.snoozeCollection(token, jobId, 3).then(() => {
      void qc.invalidateQueries({ queryKey: dataKeys.applications() })
      void qc.invalidateQueries({ queryKey: dataKeys.notificationsUnread() })
    })
  }
  const saveNote = (jobId: string, notes: string) => {
    void jobsApi.updateApplication(token, jobId, { status: "saved", notes }).then(() => {
      void qc.invalidateQueries({ queryKey: dataKeys.applications() })
    })
  }
  // Deep-linked from the Loop Bar "N new" signal (Slice 5) → open the gate once.
  const searchOpened = React.useRef(false)
  React.useEffect(() => {
    if (openSearch && !searchOpened.current) {
      searchOpened.current = true
      runMyroSearch()
    }
  }, [openSearch, runMyroSearch])

  // ── Myro Found match actions — dismiss (hide) / priority (durable intent)
  const dismissMut = useMutation({
    mutationFn: (jobId: string) => jobsApi.dismissMatchCard(token, jobId),
    onSettled: () => qc.invalidateQueries({ queryKey: dataKeys.jobs() }),
  })
  const dismissMatch = (jobId: string) => {
    setDismissed((prev) => new Set(prev).add(jobId))
    setOpenId((cur) => (cur === jobId ? null : cur))
    dismissMut.mutate(jobId)
  }
  const priorityMutation = useMutation({
    mutationFn: ({ jobId, prioritized }: { jobId: string; prioritized: boolean }) =>
      jobsApi.setJobPriority(token, jobId, prioritized),
    onMutate: async ({ jobId, prioritized }) => {
      const key = dataKeys.applications()
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ApplicationResponse[]>(key)
      qc.setQueryData<ApplicationResponse[]>(key, (current) =>
        current?.map((application) =>
          application.job_id === jobId ? { ...application, is_priority: prioritized } : application,
        ) ?? current,
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) qc.setQueryData(dataKeys.applications(), context.previous)
    },
    onSuccess: (updated) => {
      qc.setQueryData<ApplicationResponse[]>(dataKeys.applications(), (current) => {
        const applications = current ?? []
        return applications.some((application) => application.job_id === updated.job_id)
          ? applications.map((application) => application.job_id === updated.job_id ? updated : application)
          : [...applications, updated]
      })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: dataKeys.applications() }),
  })

  // Celebration on a successful run — only when matches were actually written.
  const firedRef = React.useRef(false)
  React.useEffect(() => {
    if (refreshVm.state === "done" && (refreshVm.matchesWritten ?? 0) > 0) {
      if (!firedRef.current) { firedRef.current = true; fireMoment({ intensity: 1.4 }) }
    } else {
      firedRef.current = false
    }
  }, [refreshVm.state, refreshVm.matchesWritten, fireMoment])

  function handleSkillToggle(skill: SkillGapItem) {
    if (cartSkills.find((c) => c.skill_name === skill.skill)) {
      removeSkill(skill.skill)
    } else {
      addSkill({ skill_name: skill.skill, level_from: skill.user_level ?? 0, level_to: skill.required_level ?? 1 })
    }
  }

  const trulyEmpty =
    !appsQ.isLoading && !matchesQ.isLoading && apps.length === 0 && (matchesQ.data?.jobs?.length ?? 0) === 0

  return (
    <div className="tm-intel-page" style={{ padding: "32px 36px 64px", maxWidth: 1480, margin: "0 auto" }}>
      <div className="mc-workspace">
        <aside className="mc-ws-rail mc-ws-rail--peek">
          {/* First-run loop lives in the rail, not the Jobs feed — it is
              onboarding context beside the worklist, never a banner on top of
              browsing. Renders nothing once dismissed/complete. */}
          <FirstSuccessChecklist token={token} />
          <div className="mc-rail">
            <PeekSurfaces token={token} />
          </div>
        </aside>

        <div className="mc-ws-main">
          <div className="db">
            {/* "Finish tailoring" lane moved to the CV workspace (/cv) — a
                half-finished tailored CV belongs with the CV, not the feed.
                `continueItems` still drives Agent-Picks dedup + prefetch below. */}
            <div className="db-head">
              <div className="db-segments" role="tablist" aria-label="Filter the folder">
                {FOLDER_CHIPS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="tab"
                    aria-selected={chip === c.key}
                    className={`db-seg tm-control-focus${chip === c.key ? " active" : ""}`}
                    onClick={() => setChip(c.key)}
                  >
                    {c.label}
                    <span className="db-seg-count">{counts[c.key]}</span>
                  </button>
                ))}
              </div>
              <div className="db-head-actions">
                {chip !== "found" ? <SortMenu sort={sort} onChange={setSort} /> : null}
                {chip === "found" ? (
                  <button
                    type="button"
                    className="db-btn db-btn-secondary tm-control-focus"
                    onClick={runMyroSearch}
                    disabled={isRefreshing}
                  >
                    <Search size={14} aria-hidden style={{ marginRight: 6, verticalAlign: "-2px" }} />
                    {isRefreshing ? "Searching…" : "Search again"}
                  </button>
                ) : null}
                <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={addJob.open}>
                  + {ADD_JOB_LABEL}
                </button>
              </div>
            </div>

            <MatchVettingBanner token={token} health={matchesQ.data?.match_health} />

            {chip === "found" ? (
              <MyroFoundBody
                token={token}
                found={myroFound.found}
                belowBarCount={myroFound.belowBarCount}
                rejectedCount={myroFound.rejectedCount}
                isRefreshing={isRefreshing}
                progressLabel={refreshVm.progressLabel}
                progressDone={refreshVm.progressDone}
                progressTotal={refreshVm.progressTotal}
                trulyEmpty={trulyEmpty}
                openId={openId}
                pulses={pulses}
                onSearch={runMyroSearch}
                onBrowseJobs={() => router.push("/market")}
                onOpen={(id) => setOpenId(openId === id ? null : id)}
                onDismiss={dismissMatch}
                applicationsByJobId={appByJobId}
                onPriority={(jobId, prioritized) => priorityMutation.mutate({ jobId, prioritized })}
              />
            ) : chip === "closed" ? (
              closedView.length === 0 ? (
                <div className="db-empty">{emptyCopy("closed")}</div>
              ) : (
                <VirtualFeed
                  items={closedView}
                  getKey={(it) => it.jobId}
                  estimateSize={190}
                  gap={14}
                  className="db-feed"
                  renderItem={(it) => (
                    <ClosedRow
                      it={it}
                      app={appByJobId.get(it.jobId)}
                      open={openId === it.jobId}
                      onOpen={() => setOpenId(openId === it.jobId ? null : it.jobId)}
                    />
                  )}
                />
              )
            ) : (
              <>
                {(appView?.queueItems.length ?? 0) === 0 && !appsQ.isLoading ? (
                  <div className="db-empty">
                    {emptyCopy(chip)}{" "}
                    <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={() => router.push("/market")}>
                      Browse jobs
                    </button>
                  </div>
                ) : (
                  <VirtualFeed
                    items={appView?.queueItems ?? []}
                    getKey={(it) => it.jobId}
                    estimateSize={190}
                    gap={14}
                    className="db-feed"
                    renderItem={(it) => (
                      <CollectionRow
                        it={it}
                        token={token}
                        app={appByJobId.get(it.jobId)}
                        open={openId === it.jobId}
                        pulse={pulses.get(it.jobId)}
                        onOpen={() => setOpenId(openId === it.jobId ? null : it.jobId)}
                        onUnsave={() => unsave(it.jobId)}
                        onTailor={() => router.push(`/cv?jobId=${encodeURIComponent(it.jobId)}`)}
                        onOpenCv={() => router.push("/cv")}
                        onSnooze={() => snooze(it.jobId)}
                        onSaveNote={(notes) => saveNote(it.jobId, notes)}
                        onPriorityToggle={(prioritized) => priorityMutation.mutate({ jobId: it.jobId, prioritized })}
                      />
                    )}
                  />
                )}
              </>
            )}

            {openItem ? (
              <DashboardJobDrawer
                item={openItem}
                allItems={openable}
                token={token}
                cartSkillNames={cartSkillNames}
                prioritized={openApplication?.is_priority ?? false}
                canDismiss={openCanDismiss}
                onClose={() => setOpenId(null)}
                onPriorityToggle={(prioritized) => priorityMutation.mutate({ jobId: openItem.jobId, prioritized })}
                onSkip={() => (openIsSavedApp ? unsave(openItem.jobId) : dismissMatch(openItem.jobId))}
                onSkillToggle={handleSkillToggle}
                onJump={(jobId) => setOpenId(jobId)}
              />
            ) : null}

            {addJob.modal}

            {myroSearchGate}

            {savedJobDismissal.notice && typeof document !== "undefined"
              ? createPortal(
                  <div className="db db-undo-toast" role="status" aria-live="polite">
                    <span>
                      {savedJobDismissal.notice.kind === "undo"
                        ? "Removed from Collections"
                        : savedJobDismissal.notice.kind === "dismiss-error"
                          ? "Couldn’t remove this job"
                          : "Couldn’t undo removal"}
                    </span>
                    <button
                      type="button"
                      onClick={savedJobDismissal.notice.kind === "undo" ? savedJobDismissal.undo : savedJobDismissal.retry}
                    >
                      {savedJobDismissal.notice.kind === "undo" ? "Undo" : "Retry"}
                    </button>
                  </div>,
                  document.body,
                )
              : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The "Myro found" body — Agent Picks, the cleared-the-bar list, the reveal
 *  while a run streams, and the honest below-bar / rejected footer. */
function MyroFoundBody({
  token,
  found,
  belowBarCount,
  rejectedCount,
  isRefreshing,
  progressLabel,
  progressDone,
  progressTotal,
  trulyEmpty,
  openId,
  pulses,
  onSearch,
  onBrowseJobs,
  onOpen,
  onDismiss,
  applicationsByJobId,
  onPriority,
}: {
  token: string
  found: FeedItem[]
  belowBarCount: number
  rejectedCount: number
  isRefreshing: boolean
  progressLabel: string | null
  progressDone: number | null
  progressTotal: number | null
  trulyEmpty: boolean
  openId: string | null
  pulses: ReturnType<typeof usePulses>
  onSearch: () => void
  onBrowseJobs: () => void
  onOpen: (id: string) => void
  onDismiss: (id: string) => void
  applicationsByJobId: ReadonlyMap<string, ApplicationResponse>
  onPriority: (jobId: string, prioritized: boolean) => void
}) {
  return (
    <>
      <AgentPicksBand token={token} context="collections" />
      {isRefreshing ? (
        <>
          <div className="mf-reading" role="status" aria-live="polite">
            <span className="mf-reading-dot" aria-hidden />
            <span>
              {progressLabel ?? "Myro Ops · reading the market"}
              {progressTotal != null && progressDone != null ? ` · ranked ${progressDone}/${progressTotal}` : ""}
            </span>
          </div>
          <div className="mf-skel" />
          <div className="mf-skel" />
          <div className="mf-skel" />
        </>
      ) : found.length > 0 ? (
        <>
          <VirtualFeed
            items={found}
            getKey={(it) => it.jobId}
            estimateSize={190}
            gap={14}
            className="db-feed"
            renderItem={(it) => (
              <MyroFoundRow
                it={it}
                token={token}
                open={openId === it.jobId}
                pulse={pulses.get(it.jobId)}
                onOpen={() => onOpen(it.jobId)}
                onDismiss={() => onDismiss(it.jobId)}
                prioritized={applicationsByJobId.get(it.jobId)?.is_priority ?? false}
                onPriorityToggle={(prioritized) => onPriority(it.jobId, prioritized)}
              />
            )}
          />
          <SplitFooter belowBarCount={belowBarCount} rejectedCount={rejectedCount} onBrowseJobs={onBrowseJobs} />
        </>
      ) : trulyEmpty ? (
        <div className="mf-firstrun">
          <div className="mf-firstrun-title">Run your first Myro Search</div>
          <p className="mf-firstrun-sub">
            Myro reads the live market against your CV and fills this folder with the roles that clear its quality bar.
          </p>
          <button type="button" className="db-btn db-btn-primary tm-control-focus" onClick={onSearch}>
            <Search size={14} aria-hidden style={{ marginRight: 6 }} /> Myro Search
          </button>
        </div>
      ) : (
        <div className="db-empty" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <span>Nothing cleared the bar in your last search.</span>
          <SplitFooter belowBarCount={belowBarCount} rejectedCount={rejectedCount} onBrowseJobs={onBrowseJobs} />
        </div>
      )}
    </>
  )
}

function SplitFooter({
  belowBarCount,
  rejectedCount,
  onBrowseJobs,
}: {
  belowBarCount: number
  rejectedCount: number
  onBrowseJobs: () => void
}) {
  if (belowBarCount === 0 && rejectedCount === 0) return null
  return (
    <div className="mf-footer">
      {belowBarCount > 0 ? (
        <p className="mf-footer-line">
          {belowBarCount} more ranked below the bar —{" "}
          <button type="button" className="mf-footer-link" onClick={onBrowseJobs}>
            see them in Jobs, best first →
          </button>
        </p>
      ) : null}
      {rejectedCount > 0 ? (
        <p className="mf-footer-line">
          {rejectedCount} rejected — dead listing, wrong level, or off your deal-breakers.
        </p>
      ) : null}
    </div>
  )
}
