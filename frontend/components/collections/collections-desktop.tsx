"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import "@/components/dashboard/dashboard.css"
import "@/app/(authed)/home/mission-control.css"
import { FeedCard, feedCardConfidenceClass } from "@/components/jobs/feed-card"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { feedDataFromMatch } from "@/lib/jobs/card-view"
import { PulseRow } from "@/components/dashboard/card-atoms"
import { DashboardJobDrawer } from "@/components/dashboard/job-drawer"
import { SortMenu } from "@/components/dashboard/sort-menu"
import { PeekSurfaces } from "@/components/mission-control/peek-surfaces"
import type { LoopStep } from "@/components/mission-control/loop-ring"
import { useManualAdd, ADD_JOB_LABEL } from "@/components/cv/pipeline/useManualAdd"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useCartStore } from "@/store/cartStore"
import { cv, diary, jobs as jobsApi, users as usersApi } from "@/lib/api"
import type { ApplicationResponse, JobPulse, SkillGapItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { withLocalCache, userCacheKey } from "@/lib/local-cache"
import { JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"
import type { FeedItem, SortKey } from "@/lib/dashboard/feed-model"
import {
  COLLECTION_CHIPS,
  buildCollectionsView,
  chipCounts,
  collectionsTriageCtx,
  emptyCopy,
  isExtSource,
  isMyroSource,
  matchesById,
  type CollectionChip,
} from "@/lib/collections/model"
import type { DiaryEntry } from "@/lib/forge-helpers"

/* ══════════════════════════════════════════════════════════════════════════
   Desktop Collections — successor of the /home dashboard (retired 2026-07-07).
   Saved-job worklist: pinned "Finish tailoring" lane · source chips · triage
   order (prize×winnability) · FeedCard rows with the live Job Pulse trust row ·
   the full build drawer (why-you-fit / skills / company / Reach / notes).
   Browse for UNSAVED matches lives on Jobs (/market) — this page is the
   collect→tailor half of the journey only.
   ══════════════════════════════════════════════════════════════════════════ */

const isAppliedStatus = (a: ApplicationResponse) => a.status !== "saved"
const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

export function CollectionsDesktop({ token, initialJobId }: { token: string; initialJobId?: string | null }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { skills: cartSkills, addSkill, removeSkill } = useCartStore()

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
  const { data: followed } = useQuery({
    queryKey: ["followedCompanies", token],
    queryFn: () => usersApi.followedCompanies(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => usersApi.me(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  // Rail missions — same cheap shared-key reads the old dashboard used.
  const historyQ = useQuery({
    queryKey: dataKeys.diary(),
    queryFn: () => diary.history(token),
    enabled: !!token,
  })
  const { data: evidenceData } = useQuery({
    queryKey: dataKeys.cvEvidence(),
    queryFn: () => cv.evidence(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const [chip, setChip] = React.useState<CollectionChip>("all")
  const [sort, setSort] = React.useState<SortKey>("prize")
  const [openId, setOpenId] = React.useState<string | null>(initialJobId ?? null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [undo, setUndo] = React.useState<ApplicationResponse | null>(null)
  const undoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const addJob = useManualAdd({
    token,
    onSaved: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.applications() })
      setChip("added")
    },
  })

  const apps = React.useMemo(() => appsQ.data ?? [], [appsQ.data])
  const byId = React.useMemo(() => matchesById(matchesQ.data?.jobs), [matchesQ.data])
  const counts = React.useMemo(() => chipCounts(apps), [apps])
  const appByJobId = React.useMemo(() => {
    const m = new Map<string, ApplicationResponse>()
    for (const a of apps) m.set(a.job_id, a)
    return m
  }, [apps])

  const ctx = React.useMemo(
    () =>
      collectionsTriageCtx(
        apps,
        (followed?.companies ?? []).map((c) => c.company_name),
        profile?.target_roles ?? [],
      ),
    [apps, followed, profile],
  )
  const view = React.useMemo(() => buildCollectionsView(apps, chip, sort, ctx, byId), [apps, chip, sort, ctx, byId])

  const openable = React.useMemo(() => [...view.continueItems, ...view.queueItems], [view])
  React.useEffect(() => {
    if (openId && !openable.some((it) => it.jobId === openId)) setOpenId(null)
  }, [openable, openId])
  const openItem = openable.find((it) => it.jobId === openId) ?? null

  const pulses = usePulses(token, openable.map((it) => it.jobId))
  const cartSkillNames = React.useMemo(() => new Set(cartSkills.map((c) => c.skill_name)), [cartSkills])

  // ── Unsave with a 6s undo (heart / drawer ✕ both land here)
  const remove = useMutation({
    mutationFn: (jobId: string) => jobsApi.removeTrackerJob(token, jobId),
    onSettled: () => qc.invalidateQueries({ queryKey: dataKeys.applications() }),
  })
  const unsave = (jobId: string) => {
    const app = appByJobId.get(jobId)
    if (!app) return
    remove.mutate(jobId)
    setOpenId((cur) => (cur === jobId ? null : cur))
    setUndo(app)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 6_000)
  }
  const undoUnsave = () => {
    const app = undo
    setUndo(null)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    if (!app) return
    void jobsApi.saveJob(token, app.job_id).then(() => qc.invalidateQueries({ queryKey: dataKeys.applications() }))
  }
  React.useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  const doRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    void Promise.all([appsQ.refetch(), matchesQ.refetch()]).finally(() =>
      setTimeout(() => setRefreshing(false), 500),
    )
  }

  function handleSkillToggle(skill: SkillGapItem) {
    if (cartSkills.find((c) => c.skill_name === skill.skill)) {
      removeSkill(skill.skill)
    } else {
      addSkill({
        skill_name: skill.skill,
        level_from: skill.user_level ?? 0,
        level_to: skill.required_level ?? 1,
      })
    }
  }

  // ── Rail missions (ported from the retired /home page — same signals)
  const entries = (historyQ.data?.entries ?? []) as DiaryEntry[]
  const loggedToday = entries.length > 0 && entries[0].log_date === new Date().toISOString().slice(0, 10)
  const steps: LoopStep[] = [
    { label: "Find Job", done: (matchesQ.data?.jobs?.length ?? 0) > 0, icon: "target", href: "/market" },
    { label: "Practice", done: entries.length > 0, icon: "forge", href: "/forge", reward: "+20–50" },
    { label: "Log", done: loggedToday, icon: "diary" },
    { label: "Level Up", done: (evidenceData?.score_delta ?? 0) > 0, icon: "star", href: "/skills" },
    { label: "Apply", done: apps.some(isAppliedStatus), icon: "arrowRight", href: "/market" },
  ]

  return (
    <div className="tm-intel-page" style={{ padding: "32px 36px 64px", maxWidth: 1480, margin: "0 auto" }}>
      <div className="mc-workspace">
        <aside className="mc-ws-rail mc-ws-rail--peek">
          <div className="mc-rail">
            <PeekSurfaces token={token} steps={steps} />
          </div>
        </aside>

        <div className="mc-ws-main">
          <div className="db">
            {view.continueItems.length > 0 ? (
              <section className="db-continue" aria-label="Finish tailoring">
                <div className="db-continue-head">
                  <span className="db-continue-title">Finish tailoring</span>
                  <span className="db-continue-sub">
                    {view.continueItems.length} started · one step from applying
                  </span>
                </div>
                <div className="db-continue-row">
                  {view.continueItems.map((it) => (
                    <button
                      key={it.jobId}
                      type="button"
                      className="db-continue-card tm-control-focus"
                      onClick={() => setOpenId(it.jobId)}
                    >
                      <span className="db-continue-co">{it.company ?? "Untitled company"}</span>
                      <span className="db-continue-role">{it.role}</span>
                      <span className="db-continue-cta">Finish &amp; apply →</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="db-head">
              <div className="db-segments" role="tablist" aria-label="Filter saved jobs">
                {COLLECTION_CHIPS.map((c) => (
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
                <SortMenu sort={sort} onChange={setSort} />
                <button
                  type="button"
                  className="db-btn db-btn-icon tm-control-focus"
                  onClick={doRefresh}
                  disabled={refreshing}
                  aria-label="Refresh"
                  title="Refresh"
                >
                  <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
                </button>
                <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={addJob.open}>
                  + {ADD_JOB_LABEL}
                </button>
              </div>
            </div>

            {view.queueItems.length === 0 && view.continueItems.length === 0 && !appsQ.isLoading ? (
              <div className="db-empty">
                {emptyCopy(chip)}{" "}
                <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={() => router.push("/market")}>
                  Browse jobs
                </button>
              </div>
            ) : (
              <VirtualFeed
                items={view.queueItems}
                getKey={(it) => it.jobId}
                estimateSize={190}
                gap={14}
                className="db-feed"
                renderItem={(it) => (
                  <CollectionRow
                    it={it}
                    app={appByJobId.get(it.jobId)}
                    open={openId === it.jobId}
                    pulse={pulses.get(it.jobId)}
                    onOpen={() => setOpenId(openId === it.jobId ? null : it.jobId)}
                    onUnsave={() => unsave(it.jobId)}
                    onTailor={() => router.push(`/cv/tailor?jobId=${encodeURIComponent(it.jobId)}`)}
                    onOpenCv={() => router.push("/cv")}
                  />
                )}
              />
            )}

            {openItem ? (
              <DashboardJobDrawer
                item={openItem}
                allItems={openable}
                token={token}
                cartSkillNames={cartSkillNames}
                liked
                onClose={() => setOpenId(null)}
                onLike={() => unsave(openItem.jobId)}
                onSkip={() => unsave(openItem.jobId)}
                onSkillToggle={handleSkillToggle}
                onJump={(jobId) => setOpenId(jobId)}
              />
            ) : null}

            {addJob.modal}

            {undo && typeof document !== "undefined"
              ? // Portaled to <body> so position:fixed escapes the transformed
                // .tm-page-enter containing block (same pattern as NotInterestedUndo).
                createPortal(
                  <div className="db db-undo-toast" role="status" aria-live="polite">
                    <span>Removed from Collections</span>
                    <button type="button" onClick={undoUnsave}>Undo</button>
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

/** One saved row — the dashboard FeedCard skin with Collections actions
 *  (heart = unsave · Tailor CV / Tailored ✓) and the live trust row. */
function CollectionRow({
  it,
  app,
  open,
  pulse,
  onOpen,
  onUnsave,
  onTailor,
  onOpenCv,
}: {
  it: FeedItem
  app: ApplicationResponse | undefined
  open: boolean
  pulse?: JobPulse
  onOpen: () => void
  onUnsave: () => void
  onTailor: () => void
  onOpenCv: () => void
}) {
  const [leaving, setLeaving] = React.useState(false)
  const leaveThen = (fn: () => void) => {
    setLeaving(true)
    window.setTimeout(fn, 230)
  }
  const applied = app ? app.status !== "saved" : false
  const tailored = !!app?.cv_badge
  return (
    <FeedCard
      data={feedDataFromMatch({ jobId: it.jobId, company: it.company, role: it.role, job: it.job, fit: it.fit })}
      variant="row"
      open={open}
      leaving={leaving}
      extraClass={feedCardConfidenceClass(pulse)}
      onOpen={onOpen}
      badges={
        <>
          {applied ? <span className="db-statuschip">Applied</span> : null}
          {app && isExtSource(app.source) ? <span className="db-sourcechip">Extension</span> : null}
          {app && !isExtSource(app.source) && !isMyroSource(app.source) ? (
            <span className="db-sourcechip">You added</span>
          ) : null}
        </>
      }
      pulse={<PulseRow pulse={pulse} />}
      actions={
        <div className="db-card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="db-icon-btn liked"
            aria-label="Remove from Collections"
            title="Remove from Collections"
            onClick={() => leaveThen(onUnsave)}
          >
            <HeartGlyph />
          </button>
          {tailored ? (
            <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={onOpenCv}>
              Tailored ✓
            </button>
          ) : (
            <button type="button" className="db-btn db-btn-primary tm-control-focus" onClick={onTailor}>
              Tailor CV
            </button>
          )}
        </div>
      }
    />
  )
}

function HeartGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 14c1.5-1.5 2-3.2 2-4.6C21 6.4 18.6 4 15.6 4 14.2 4 12.9 4.6 12 5.6 11.1 4.6 9.8 4 8.4 4 5.4 4 3 6.4 3 9.4c0 1.4.5 3.1 2 4.6l7 6.6 7-6.6Z" />
    </svg>
  )
}
