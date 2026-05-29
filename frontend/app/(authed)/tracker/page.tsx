"use client"

import { useEffect, useMemo, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { useViewport } from "@/mobile"
import { jobs, APPLICATION_STAGES } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useTrackerBoard, partitionByStage, partitionVerdicts } from "@/components/tracker/useTrackerBoard"
import type { StageKey } from "@/components/tracker/useTrackerBoard"
import { TrackerHeader } from "@/components/tracker/TrackerHeader"
import { KanbanBoard } from "@/components/tracker/KanbanBoard"
import { StuckBanner } from "@/components/tracker/StuckBanner"
import { ApplicationCard } from "@/components/tracker/ApplicationCard"
import { MobileStagePills } from "@/components/tracker/MobileStagePills"
import { VerdictsTab } from "@/components/tracker/VerdictsTab"
import { ReviewModal } from "@/components/tracker/ReviewModal"
import { ManualAddModal } from "@/components/tracker/ManualAddModal"
import { DeleteConfirmDialog } from "@/components/tracker/DeleteConfirmDialog"
import { StatusPicker } from "@/components/tracker/StatusPicker"

type Tab = "active" | "verdicts"

function TrackerPageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { isDesktop } = useViewport()

  const initialTab = (searchParams.get("tab") === "verdicts" ? "verdicts" : "active") as Tab
  const initialStage = (APPLICATION_STAGES as readonly string[]).includes(searchParams.get("stage") ?? "")
    ? (searchParams.get("stage") as StageKey)
    : "applied"

  const [tab, setTab] = useState<Tab>(initialTab)
  const [mobileStage, setMobileStage] = useState<StageKey>(initialStage)
  const [manualOpen, setManualOpen] = useState(false)
  const [reviewJobId, setReviewJobId] = useState<string | null>(null)
  const [reviewDefaultStage, setReviewDefaultStage] = useState<StageKey>("applied")
  const [deleteTarget, setDeleteTarget] = useState<ApplicationResponse | null>(null)
  const [sparkleJobId, setSparkleJobId] = useState<string | null>(null)
  const [sparkleTrigger, setSparkleTrigger] = useState(0)
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [stalePickerJobId, setStalePickerJobId] = useState<string | null>(null)

  const {
    applications, applicationsLoading, staleApplications,
    updateStatus, updateNotes, dismissStale, deleteApplication,
  } = useTrackerBoard()

  const stuckJobIds = useMemo(() => new Set(staleApplications.map(s => s.job_id)), [staleApplications])

  const byStage = useMemo(() => partitionByStage(applications), [applications])
  const verdicts = useMemo(() => partitionVerdicts(applications), [applications])
  const counts = useMemo(() => {
    const out: Record<StageKey, number> = {
      saved: 0, applied: 0, screening: 0, interviewing: 0, final_round: 0,
    }
    for (const k of Object.keys(out) as StageKey[]) out[k] = byStage[k].length
    return out
  }, [byStage])

  // Reset to default mobile stage if its column is empty AND another column has cards.
  useEffect(() => {
    if (isDesktop) return
    if (counts[mobileStage] === 0) {
      const firstWithCards = (APPLICATION_STAGES as readonly StageKey[]).find(s => counts[s] > 0)
      if (firstWithCards) setMobileStage(firstWithCards)
    }
  }, [counts, mobileStage, isDesktop])

  // Persist tab + mobileStage in URL.
  useEffect(() => {
    if (!ready) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    if (!isDesktop && tab === "active") params.set("stage", mobileStage)
    else params.delete("stage")
    router.replace(`/tracker?${params.toString()}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mobileStage, isDesktop, ready])

  if (!ready || !token) {
    return <div />
  }

  function handleStatusChange(jobId: string, status: ApplicationStatus) {
    const before = applications.find(a => a.job_id === jobId)?.status
    updateStatus.mutate({ jobId, status }, {
      onSuccess: (res) => {
        const isOutcome = (["ghosted", "rejected", "offer", "withdrew"] as ApplicationStatus[]).includes(status)
        if (isOutcome) {
          const isStage = before && (APPLICATION_STAGES as readonly string[]).includes(before)
          setReviewDefaultStage(isStage ? (before as StageKey) : "applied")
          setReviewJobId(jobId)
        }
        if (status === "offer" && res?.is_first_offer) {
          setSparkleJobId(jobId)
          setSparkleTrigger(n => n + 1)
        }
      },
    })
  }

  function handleWithdraw(jobId: string) {
    handleStatusChange(jobId, "withdrew")
  }

  function handleDeleteClick(jobId: string) {
    const target = applications.find(a => a.job_id === jobId)
    if (target) setDeleteTarget(target)
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    deleteApplication.mutate(deleteTarget.job_id, {
      onSuccess: () => {
        setDeleteTarget(null)
        showToast("Deleted")
      },
    })
  }

  function handleNotesChange(jobId: string, notes: string) {
    updateNotes.mutate({ jobId, notes })
  }

  function handleDismiss(jobId: string) {
    dismissStale.mutate(jobId)
  }

  async function handleReviewSubmit(data: { star_rating: number; last_stage: string; written_note?: string | null }) {
    if (!reviewJobId || !token) return
    await jobs.submitReview(token, reviewJobId, data)
    setReviewedJobIds(prev => new Set(prev).add(reviewJobId))
    setReviewJobId(null)
    showToast("Review submitted")
  }

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  const reviewApp = reviewJobId ? applications.find(a => a.job_id === reviewJobId) : null

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 80 }}>
        <TrackerHeader
          tab={tab}
          onTab={setTab}
          activeCount={Object.values(counts).reduce((a, b) => a + b, 0)}
          verdictsCount={verdicts.length}
          pendingReviewCount={verdicts.filter(v => !reviewedJobIds.has(v.job_id)).length}
          onAddManually={() => setManualOpen(true)}
        />

        {tab === "active" && (
          <StuckBanner
            stale={staleApplications}
            onMarkGhosted={(jobId) => handleStatusChange(jobId, "ghosted")}
            onUpdate={(jobId) => setStalePickerJobId(jobId)}
            onDismiss={handleDismiss}
          />
        )}

        {applicationsLoading ? (
          <EmptyState message="Loading…" />
        ) : applications.length === 0 ? (
          <EmptyBoard onAddManually={() => setManualOpen(true)} />
        ) : tab === "active" ? (
          isDesktop ? (
            <KanbanBoard
              apps={applications}
              stuckJobIds={stuckJobIds}
              sparkleJobId={sparkleJobId}
              sparkleTrigger={sparkleTrigger}
              onStatusChange={handleStatusChange}
              onWithdraw={handleWithdraw}
              onDelete={handleDeleteClick}
              onNotesChange={handleNotesChange}
            />
          ) : (
            <>
              <MobileStagePills active={mobileStage} counts={counts} onChange={setMobileStage} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {byStage[mobileStage].length === 0 ? (
                  <EmptyState message={`Nothing in ${mobileStage.replace("_", " ")} yet.`} />
                ) : (
                  byStage[mobileStage].map(app => (
                    <ApplicationCard
                      key={app.id}
                      app={app}
                      isStuck={stuckJobIds.has(app.job_id)}
                      isManual={app.source === "manual_web"}
                      sparkleTrigger={sparkleJobId === app.job_id ? sparkleTrigger : 0}
                      onStatusChange={(s) => handleStatusChange(app.job_id, s)}
                      onWithdraw={() => handleWithdraw(app.job_id)}
                      onDelete={() => handleDeleteClick(app.job_id)}
                      onNotesChange={(notes) => handleNotesChange(app.job_id, notes)}
                      isMobile
                    />
                  ))
                )}
              </div>
            </>
          )
        ) : (
          <VerdictsTab
            apps={applications}
            reviewedJobIds={reviewedJobIds}
            onOpenReview={(jobId) => setReviewJobId(jobId)}
            onDelete={handleDeleteClick}
          />
        )}
      </div>

      {manualOpen && (
        <ManualAddModal
          token={token}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            setManualOpen(false)
            queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
            showToast("Added to tracker")
          }}
        />
      )}

      {reviewJobId && reviewApp && (
        <ReviewModal
          company={reviewApp.company ?? null}
          defaultStage={reviewDefaultStage}
          onClose={() => setReviewJobId(null)}
          onSubmit={handleReviewSubmit}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          company={deleteTarget.company}
          title={deleteTarget.title}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {stalePickerJobId && (() => {
        const target = applications.find(a => a.job_id === stalePickerJobId)
        if (!target) return null
        return (
          <StatusPicker
            current={target.status}
            asSheet
            onClose={() => setStalePickerJobId(null)}
            onPick={(status) => {
              handleStatusChange(stalePickerJobId, status)
              setStalePickerJobId(null)
            }}
          />
        )
      })()}

      {toast && (
        <div
          aria-live="polite"
          style={{
            position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
            background: "var(--tm-surface)", color: "var(--tm-text)",
            border: "1px solid var(--tm-int-border)",
            padding: "8px 16px", borderRadius: 99,
            fontSize: 13, fontFamily: "inherit",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            zIndex: 300,
          }}
        >
          {toast}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .tm-tracker-board { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  )
}

const TRACKER_GHOST_ROWS: Array<{ company: string; title: string; stage: string }> = [
  { company: "Stripe", title: "Product Designer", stage: "applied" },
  { company: "Razorpay", title: "Growth Analyst", stage: "screening" },
  { company: "Linear", title: "Frontend Engineer", stage: "interviewing" },
]

function EmptyBoard({ onAddManually }: { onAddManually: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        padding: "32px 28px 20px", textAlign: "center", borderRadius: 12,
        border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)",
        display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
      }}>
        <div style={{ fontFamily: "var(--tm-font-serif, inherit)", fontSize: 18, color: "var(--tm-text)" }}>
          Your tracker is empty
        </div>
        <div style={{ fontSize: 13, color: "var(--tm-text-faint)", maxWidth: 380 }}>
          Save a job from Matched Jobs, or add one manually from any portal —
          Stripe, Greenhouse, a referral. Everything you&apos;re tracking lives here.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <a href="/jobs" style={{
            padding: "8px 16px", borderRadius: 99,
            background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)",
            fontSize: 12, fontWeight: 600, textDecoration: "none",
          }}>
            Browse matches →
          </a>
          <button
            onClick={onAddManually}
            style={{
              padding: "8px 16px", borderRadius: 99,
              background: "transparent", border: "1px solid var(--tm-border)",
              color: "var(--tm-text-muted)", cursor: "pointer",
              fontSize: 12, fontFamily: "inherit",
            }}
          >
            + Add manually
          </button>
        </div>
      </div>
      <div aria-hidden style={{ display: "flex", flexDirection: "column", gap: 8, opacity: 0.42 }}>
        <div style={{
          fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--tm-text-faint)", textAlign: "center",
        }}>
          Preview · saved jobs will appear like this
        </div>
        {TRACKER_GHOST_ROWS.map((r) => (
          <div key={r.company} style={{
            display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center",
            padding: "12px 14px", borderRadius: 10,
            border: "1px dashed var(--tm-border-soft)", background: "var(--tm-surface)",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text-faint)" }}>{r.title}</div>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{r.company}</div>
            </div>
            <div style={{
              fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.06em",
              textTransform: "uppercase", color: "var(--tm-text-faint)",
              padding: "4px 8px", borderRadius: 99, border: "1px dashed var(--tm-border-soft)",
            }}>
              {r.stage}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      padding: "32px 28px", textAlign: "center", borderRadius: 10,
      border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)",
      fontSize: 13, color: "var(--tm-text-faint)",
    }}>
      {message}
    </div>
  )
}

export default function TrackerPage() {
  return (
    <Suspense fallback={<div />}>
      <TrackerPageInner />
    </Suspense>
  )
}
