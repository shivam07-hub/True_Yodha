/**
 * WorkspacePipeline — the unified application board inside /cv.
 *
 * Tracker → CV merge, lens-collapse pass (2026-06-02): the By-stage / By-company
 * toggle was cognitive dissonance — the company view already shows each pursuit's
 * stage on its row + a stage-grouped rail. So there is now ONE arrangement
 * (company folders + pipeline-health rail) and a single Active | Closed filter.
 *
 *   filter "active"  → company folders (inline stage picker per row) + stale
 *                      banner + manual-add + the stage rollup rail.
 *   filter "closed"  → verdicts + star reviews.
 *
 * Capability parity with the old tracker: stage moves (inline picker + the CV
 * detail's PursuitStageControl), stale-recovery, manual-add, verdicts, delete
 * (via the Closed/verdicts surface). No XP coupling.
 */
"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { jobs, APPLICATION_STAGES } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus, CVVersion } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { CompanyFolderRow } from "@/components/cv/builder/library-company-row"
import { I, LIcon } from "@/components/cv/builder/library-icons"
import { useTrackerBoard, partitionVerdicts } from "./useTrackerBoard"
import { StuckBanner } from "./StuckBanner"
import { VerdictsTab } from "./VerdictsTab"
import { ReviewModal } from "./ReviewModal"
import { ManualAddModal } from "./ManualAddModal"
import { DeleteConfirmDialog } from "./DeleteConfirmDialog"
import { StatusPicker } from "./StatusPicker"

export type PipelineFilter = "active" | "closed"

interface Props {
  filter: PipelineFilter
  versions: CVVersion[]
  onOpenJob: (jobId: string) => void
}

const ACTIVE_SET = APPLICATION_STAGES as readonly string[]

export function WorkspacePipeline({ filter, versions, onOpenJob }: Props) {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const [manualOpen, setManualOpen] = useState(false)
  const [reviewJobId, setReviewJobId] = useState<string | null>(null)
  const [reviewDefaultStage, setReviewDefaultStage] = useState<string>("applied")
  const [deleteTarget, setDeleteTarget] = useState<ApplicationResponse | null>(null)
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [stalePickerJobId, setStalePickerJobId] = useState<string | null>(null)

  const {
    applications, applicationsLoading, staleApplications,
    updateStatus, dismissStale, deleteApplication,
  } = useTrackerBoard()

  const activeApps = useMemo(
    () => applications.filter(a => ACTIVE_SET.includes(a.status)),
    [applications],
  )
  const verdicts = useMemo(() => partitionVerdicts(applications), [applications])

  // Active pursuits grouped into company folders (the one arrangement).
  const companies = useMemo(() => {
    const map = new Map<string, ApplicationResponse[]>()
    for (const app of activeApps) {
      const key = app.company ?? "Unknown"
      const arr = map.get(key)
      if (arr) arr.push(app)
      else map.set(key, [app])
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [activeApps])

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  function handleStatusChange(jobId: string, status: ApplicationStatus) {
    const before = applications.find(a => a.job_id === jobId)?.status
    updateStatus.mutate({ jobId, status }, {
      onSuccess: () => {
        const isOutcome = (["ghosted", "rejected", "offer", "withdrew"] as ApplicationStatus[]).includes(status)
        if (isOutcome) {
          setReviewDefaultStage(before && ACTIVE_SET.includes(before) ? before : "applied")
          setReviewJobId(jobId)
        }
      },
    })
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    deleteApplication.mutate(deleteTarget.job_id, {
      onSuccess: () => { setDeleteTarget(null); showToast("Deleted") },
    })
  }

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

  // ── Closed: verdicts + reviews ──────────────────────────────────────
  if (filter === "closed") {
    return (
      <>
        {verdicts.length === 0 ? (
          <EmptyState message="No closed applications yet. Outcomes — offers, rejections, ghostings — land here." />
        ) : (
          <VerdictsTab
            apps={applications}
            reviewedJobIds={reviewedJobIds}
            onOpenReview={(jobId) => setReviewJobId(jobId)}
            onDelete={(jobId) => {
              const t = applications.find(a => a.job_id === jobId)
              if (t) setDeleteTarget(t)
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
        <Toast message={toast} />
      </>
    )
  }

  // ── Active: company folders + stale banner + manual-add ─────────────
  // (the stage-rollup rail is rendered by LibraryView as a tm-lib-root sibling)
  return (
    <>
      <StuckBanner
        stale={staleApplications}
        onMarkGhosted={(jobId) => handleStatusChange(jobId, "ghosted")}
        onUpdate={(jobId) => setStalePickerJobId(jobId)}
        onDismiss={(jobId) => dismissStale.mutate(jobId)}
      />

      <div className="tm-lib-folders-head">
        <div className="tm-lib-folders-head-label">
          <LIcon d={I.folder}/>
          Company folders
        </div>
        <span className="tm-lib-folders-head-count">{companies.length}</span>
        <span className="tm-lib-folders-head-divider"/>
        <button type="button" className="tm-lib-btn sm" onClick={() => setManualOpen(true)}>
          <LIcon d={I.plus} size={12}/> Add manually
        </button>
      </div>

      {companies.length === 0 ? (
        <div className="tm-lib-empty">
          <LIcon d={I.folder} size={28}/>
          <div className="tm-lib-empty-title">Nothing in your pipeline yet</div>
          <div className="tm-lib-empty-sub">
            Save jobs from Live Job Data, or add one manually — every job you tailor a CV for is tracked here.
          </div>
          <Link href="/home#browse" className="tm-lib-empty-link">
            Browse jobs <LIcon d={I.chevR} size={12}/>
          </Link>
        </div>
      ) : (
        <div className="tm-lib-folder-list">
          {companies.map(([name, apps], i) => (
            <CompanyFolderRow
              key={name}
              companyName={name}
              apps={apps}
              versions={versions}
              defaultOpen={i < 2}
              onOpenJob={onOpenJob}
              onStageChange={handleStatusChange}
            />
          ))}
        </div>
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

      {reviewJobId && reviewApp && (
        <ReviewModal
          company={reviewApp.company ?? null}
          defaultStage={reviewDefaultStage}
          onClose={() => setReviewJobId(null)}
          onSubmit={handleReviewSubmit}
        />
      )}

      <Toast message={toast} />
    </>
  )
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
        background: "var(--tm-surface)", color: "var(--tm-text)",
        border: "1px solid var(--tm-int-border)",
        padding: "8px 16px", borderRadius: 99,
        fontSize: 13, fontFamily: "inherit",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 300,
      }}
    >
      {message}
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
