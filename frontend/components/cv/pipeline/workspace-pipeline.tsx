/**
 * WorkspacePipeline — the application pipeline, absorbed into /cv.
 *
 * Tracker → CV merge (grill 2026-06-02). This is the old /tracker page's
 * orchestration, lifted into a component the CV "CV & Applications" workspace
 * mounts under the By-stage lens. The lens/filter toggle now lives in the
 * workspace shell (LibraryView); this component just renders for a given
 * `filter` ("active" = the 5-stage kanban, "closed" = verdicts/reviews) and
 * reports row clicks up via `onOpenJob` (→ the CV detail/playground).
 *
 * Capability parity with the old tracker: stage moves, stale-recovery banner,
 * manual-add, verdicts + star reviews, delete. No XP coupling (verified).
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { useViewport } from "@/mobile"
import { jobs, APPLICATION_STAGES } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useTrackerBoard, partitionByStage, partitionVerdicts } from "./useTrackerBoard"
import type { StageKey } from "./useTrackerBoard"
import { KanbanBoard } from "./KanbanBoard"
import { StuckBanner } from "./StuckBanner"
import { ApplicationCard } from "./ApplicationCard"
import { MobileStagePills } from "./MobileStagePills"
import { VerdictsTab } from "./VerdictsTab"
import { ReviewModal } from "./ReviewModal"
import { ManualAddModal } from "./ManualAddModal"
import { DeleteConfirmDialog } from "./DeleteConfirmDialog"
import { StatusPicker } from "./StatusPicker"

export type PipelineFilter = "active" | "closed"

interface Props {
  filter: PipelineFilter
  /** Initial mobile stage column (from ?stage= / redirect). */
  initialStage?: StageKey
}

// Each card opens its CV detail itself via the built-in CVBadgeLink
// (`/cv?jobId=…`), so no onOpen plumbing is needed here — clicking a card
// navigates the workspace into the playground/detail view.
export function WorkspacePipeline({ filter, initialStage = "applied" }: Props) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const { isDesktop } = useViewport()

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

  // Reset to default mobile stage if its column is empty AND another has cards.
  useEffect(() => {
    if (isDesktop) return
    if (counts[mobileStage] === 0) {
      const firstWithCards = (APPLICATION_STAGES as readonly StageKey[]).find(s => counts[s] > 0)
      if (firstWithCards) setMobileStage(firstWithCards)
    }
  }, [counts, mobileStage, isDesktop])

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
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

  function handleWithdraw(jobId: string) { handleStatusChange(jobId, "withdrew") }

  function handleDeleteClick(jobId: string) {
    const target = applications.find(a => a.job_id === jobId)
    if (target) setDeleteTarget(target)
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    deleteApplication.mutate(deleteTarget.job_id, {
      onSuccess: () => { setDeleteTarget(null); showToast("Deleted") },
    })
  }

  function handleNotesChange(jobId: string, notes: string) {
    updateNotes.mutate({ jobId, notes })
  }

  function handleDismiss(jobId: string) { dismissStale.mutate(jobId) }

  async function handleReviewSubmit(data: { star_rating: number; last_stage: string; written_note?: string | null }) {
    if (!reviewJobId || !token) return
    await jobs.submitReview(token, reviewJobId, data)
    setReviewedJobIds(prev => new Set(prev).add(reviewJobId))
    setReviewJobId(null)
    showToast("Review submitted")
  }

  const reviewApp = reviewJobId ? applications.find(a => a.job_id === reviewJobId) : null

  if (applicationsLoading) {
    return <EmptyState message="Loading pipeline…" />
  }

  if (applications.length === 0) {
    return <EmptyBoard onAddManually={() => setManualOpen(true)} />
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {filter === "closed"
            ? `${verdicts.length} closed`
            : `${Object.values(counts).reduce((a, b) => a + b, 0)} active`}
        </span>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          style={{
            padding: "7px 14px", borderRadius: 99, background: "transparent",
            border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)",
            cursor: "pointer", fontSize: 12, fontFamily: "inherit",
          }}
        >
          + Add manually
        </button>
      </div>

      {filter === "active" && (
        <StuckBanner
          stale={staleApplications}
          onMarkGhosted={(jobId) => handleStatusChange(jobId, "ghosted")}
          onUpdate={(jobId) => setStalePickerJobId(jobId)}
          onDismiss={handleDismiss}
        />
      )}

      {filter === "closed" ? (
        <VerdictsTab
          apps={applications}
          reviewedJobIds={reviewedJobIds}
          onOpenReview={(jobId) => setReviewJobId(jobId)}
          onDelete={handleDeleteClick}
        />
      ) : isDesktop ? (
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
      )}

      {manualOpen && (
        <ManualAddModal
          token={token!}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            setManualOpen(false)
            queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
            showToast("Added to pipeline")
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
    </div>
  )
}

function EmptyBoard({ onAddManually }: { onAddManually: () => void }) {
  return (
    <div style={{
      padding: "32px 28px 24px", textAlign: "center", borderRadius: 12,
      border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)",
      display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
    }}>
      <div style={{ fontFamily: "var(--tm-font-serif, inherit)", fontSize: 18, color: "var(--tm-text)" }}>
        Nothing in your pipeline yet
      </div>
      <div style={{ fontSize: 13, color: "var(--tm-text-faint)", maxWidth: 380 }}>
        Save a job from Live Job Data, or add one manually from any portal. Every
        job you tailor a CV for is tracked here.
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <a href="/home#browse" style={{
          padding: "8px 16px", borderRadius: 99,
          background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)",
          fontSize: 12, fontWeight: 600, textDecoration: "none",
        }}>
          Browse jobs →
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
