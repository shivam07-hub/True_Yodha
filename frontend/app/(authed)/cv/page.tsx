"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CvScoreProgress } from "@/components/cv/cv-score-progress"
import { CvStructuredRecovery } from "@/components/cv/cv-structured-recovery"
import { DownloadCVButton } from "@/components/cv/download-cv-button"
import { tokenizedUserMessage, type CVUploadPhase } from "@/lib/cv-upload-state"
import { claimPendingAnonCv, hasPendingAnonCvClaim } from "@/lib/anon-cv-claim"
import { CvDocumentSkeleton, CvSkeleton } from "@/components/loading/page-skeletons"
import { PlaygroundView } from "@/components/cv/builder/playground-view"
import { MasterWorkspace } from "@/components/cv/builder/master-workspace"
import { LibraryView } from "@/components/cv/builder/library-view"
import { Icon } from "@/components/cv/builder/icons"
import { runContentChecks } from "@/components/cv/builder/content-checks"
import { domainLabel } from "@/lib/domain-labels"
import {
  CVUploadFailure,
  beginCVUpload,
  type CVUploadFallbackSubmissionResponse,
  cv,
  jobs as jobsApi,
  getPersistedCVUploadJobId,
  recordCVUploadPickRejected,
  resumePendingCVUpload,
  type CVUploadResult,
  users,
} from "@/lib/api"
import {
  CV_UPLOAD_PROGRESS_EVENT,
  CV_UPLOAD_TERMINAL_EVENT,
  type CVUploadProgressEventDetail,
  type CVUploadTerminalEventDetail,
} from "@/lib/cv-upload-events"
import { hasPendingCVUpload } from "@/lib/cv-upload-queue"
import { jwtSub } from "@/lib/cv-resumable-upload"
import { dataKeys, invalidateCvData } from "@/lib/domain-data"
import { preflightCVUploadFile } from "@/lib/cv-file-detect"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCVPlayground } from "@/lib/hooks/use-cv-playground"
import { useXPStore } from "@/store/xpStore"
import { useParticleMoment } from "@/components/particle"

import "./cv-fonts.css"
import "./cv-sheet.css"
import "./cv-builder.css"
import "./playground-v2.css"

type ViewMode = "baseline" | "playground" | "master-edit"

function CVPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")
  const focusSkill = searchParams.get("skill")
  const mentorRequested = searchParams.get("mentor") === "1"

  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeUploadJobId, setActiveUploadJobId] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<{ skills_detected: number; score: number } | null>(null)
  // #6 deploy-style loading: live phase + start-time + the done-morph's Improve target.
  const [uploadPhase, setUploadPhase] = useState<CVUploadPhase | null>(null)
  const [uploadStartedAt, setUploadStartedAt] = useState<string | null>(null)
  const [biggestDrag, setBiggestDrag] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Calm "we've got it" state: the mobile radio dropped the upload mid-flight,
  // the file is held durably (IndexedDB) and will auto-resume on reconnect /
  // next app load. NOT an error — the user can keep moving.
  const [uploadDeferred, setUploadDeferred] = useState(false)
  const [uploadFailureCount, setUploadFailureCount] = useState(0)
  const [lastFailureCode, setLastFailureCode] = useState<string>("unknown")
  const [lastUploadMeta, setLastUploadMeta] = useState<{ name: string; type: string; size: number } | null>(null)
  const [fallbackSubmitting, setFallbackSubmitting] = useState(false)
  const [fallbackError, setFallbackError] = useState<string | null>(null)
  const [fallbackReceipt, setFallbackReceipt] = useState<CVUploadFallbackSubmissionResponse | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [showPickerHint, setShowPickerHint] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Reentry guard: setUploading(true) is async, mobile Chrome can fire change
  // twice; the ref blocks the second call synchronously.
  const uploadInFlightRef = useRef(false)
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{ versionId: number; text: string } | null>(null)
  const [editDraft, setEditDraft] = useState("")

  // WOW moment #2 — CV processing just resolved. Celebrate the reveal with a
  // centre burst once per transition into a result. (firedRef guards the
  // null→result edge so a poll-resume re-render doesn't double-fire.)
  const fireMoment = useParticleMoment()
  const cvResultFiredRef = useRef(false)
  useEffect(() => {
    if (uploadResult && !cvResultFiredRef.current) {
      cvResultFiredRef.current = true
      fireMoment({ intensity: 1.2 })
    }
    if (!uploadResult) cvResultFiredRef.current = false
  }, [uploadResult, fireMoment])

  const playground = useCVPlayground({ token, jobId, enabled: !!ready && !!token })
  const baselines = playground.baselines
  const hasBaseline = baselines.length > 0
  const cvData = playground.structured
  const bodyText = playground.currentBaseline?.body_text?.trim() ?? ""

  const profileQuery = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!ready && !!token,
    staleTime: 5 * 60 * 1000,
  })

  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token!),
    enabled: !!ready && !!token,
    staleTime: 2 * 60 * 1000,
  })

  const editParam = searchParams.get("edit")
  const view: ViewMode = jobId ? "playground" : editParam === "1" ? "master-edit" : "baseline"

  // The old Applications tab (?view=active, legacy ?filter=closed) moved to its
  // own surface — /preparations (grill 2026-07-15). Redirect so deep links and
  // bookmarks keep working.
  const legacyView = searchParams.get("view")
  const legacyFilter = searchParams.get("filter")
  useEffect(() => {
    if (legacyView === "active" || legacyFilter === "closed") router.replace("/preparations")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyView, legacyFilter])

  function navigate(href: string) { router.push(href) }
  function openJob(id: string) { navigate(`/cv?jobId=${encodeURIComponent(id)}`) }
  // Editing the master is a page-level full-bleed view (same mount level as the
  // per-job PlaygroundView) — NOT a card buried in LibraryView's chrome, so the
  // editing surface has the same boundary as the playground.
  function openMasterEdit() { navigate("/cv?edit=1") }
  function backToBaseline() { navigate("/cv") }
  // Tailored export is a dedicated full-page route (Design C). Carry the match
  // score so the export header can show the JD-match pill without a refetch.
  // The export page re-hydrates hidden items from the SAVED version, so any
  // pending (debounced) toggles must be flushed before leaving — else the
  // artifact resurrects deselected lines (ADR-0020).
  async function openPdf(matchScore = 0) {
    if (!jobId) return
    try {
      await playground.flushHidden()
    } catch {
      return // save failed — stay put; the hook surfaced the error banner
    }
    if (matchScore > 0) {
      try { sessionStorage.setItem(`myro-cv-score-${jobId}`, String(matchScore)) } catch { /* blocked */ }
    }
    const scoreParam = matchScore > 0 ? `&score=${matchScore}` : ""
    navigate(`/cv/export?jobId=${encodeURIComponent(jobId)}${scoreParam}`)
  }

  function openFilePicker() {
    setShowUpload(true)
    setUploadError(null)
    setUploadResult(null); setUploadPhase(null); setUploadStartedAt(null)
    setFallbackError(null)
    // Defer click so dialog mount doesn't intercept the activation gesture
    requestAnimationFrame(() => fileInputRef.current?.click())
  }

  // #6 — the status payload carries no domain breakdown, so read the freshly
  // invalidated scores cache to pick the biggest-drag domain for the one
  // Improve action on the done-morph (Q4 / OPEN GAP resolution).
  const lowestDomainFromCache = useCallback((): string | null => {
    const data = queryClient.getQueryData<{ domain_scores?: Record<string, number> }>(dataKeys.scores())
    const ds = data?.domain_scores
    if (!ds) return null
    let lo: string | null = null
    let loVal = Infinity
    for (const [k, v] of Object.entries(ds)) {
      if (typeof v === "number" && v < loVal) { loVal = v; lo = k }
    }
    return lo
  }, [queryClient])

  // The reveal beat (#34 S4): strongest + weakest domain (labelled) for the
  // strong/weak callout. Reads the same freshly-invalidated scores cache.
  function strongWeakFromCache(): { strong: string | null; weak: string | null } {
    const data = queryClient.getQueryData<{ domain_scores?: Record<string, number> }>(dataKeys.scores())
    const ds = data?.domain_scores
    if (!ds) return { strong: null, weak: null }
    let hi: string | null = null, lo: string | null = null
    let hiVal = -Infinity, loVal = Infinity
    for (const [k, v] of Object.entries(ds)) {
      if (typeof v !== "number") continue
      if (v > hiVal) { hiVal = v; hi = k }
      if (v < loVal) { loVal = v; lo = k }
    }
    return {
      strong: hi ? domainLabel(hi) : null,
      weak: lo && lo !== hi ? domainLabel(lo) : null,
    }
  }

  // A retryable network interrupt/timeout on the phase-1 POST means the file is
  // already held durably and will auto-resume — the calm "we've got it" path,
  // not a failure wall (CV-upload weak-radio resilience).
  function isDeferrableUpload(err: unknown): err is InstanceType<typeof CVUploadFailure> {
    return (
      err instanceof CVUploadFailure &&
      err.retryable &&
      (err.code === "upload_post_interrupted" || err.code === "upload_post_timeout")
    )
  }

  // Shared terminal-success handling for first upload, text claim, and resume.
  const finishUploadSuccess = useCallback((result: CVUploadResult) => {
    if (result.new_coin_balance != null) applyXpChange({ newBalance: result.new_coin_balance, action: "cv_upload" })
    invalidateCvData(queryClient)
    queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
    queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
    queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
    if (result.score == null) {
      setUploadPhase("ready")
      setActiveUploadJobId(null)
      router.push(result.redirect_to)
      return
    }
    setUploadPhase("ready")
    setBiggestDrag(lowestDomainFromCache())
    setUploadResult({ skills_detected: result.skills_detected, score: result.score })
    setUploadFailureCount(0)
    setLastFailureCode("unknown")
    setFallbackError(null)
    setFallbackReceipt(null)
    setUploadDeferred(false)
    setActiveUploadJobId(null)
  }, [applyXpChange, jobId, lowestDomainFromCache, queryClient, router])

  // The AppShell owns polling so this page can unmount while work continues.
  // When the user stays here, these events keep the existing truthful progress
  // UI in sync without creating a second poller.
  useEffect(() => {
    const onProgress = (event: Event) => {
      const { jobId: progressJobId, status } = (event as CustomEvent<CVUploadProgressEventDetail>).detail
      if (!progressJobId) return
      setActiveUploadJobId((current) => current ?? progressJobId)
      setUploadPhase(status.current_phase ?? "queued")
      if (status.started_at) setUploadStartedAt(status.started_at)
    }
    const onTerminal = (event: Event) => {
      const detail = (event as CustomEvent<CVUploadTerminalEventDetail>).detail
      if (!detail?.jobId) return
      setActiveUploadJobId((current) => current === detail.jobId ? null : current)
      if (detail.outcome === "done") {
        finishUploadSuccess(detail.result)
        return
      }
      setUploadPhase("failed")
      setLastFailureCode(detail.error instanceof CVUploadFailure ? detail.error.code : "upload_unknown_error")
      setUploadError(tokenizedUserMessage(detail.error.message))
      setUploadFailureCount((count) => count + 1)
    }
    window.addEventListener(CV_UPLOAD_PROGRESS_EVENT, onProgress)
    window.addEventListener(CV_UPLOAD_TERMINAL_EVENT, onTerminal)
    return () => {
      window.removeEventListener(CV_UPLOAD_PROGRESS_EVENT, onProgress)
      window.removeEventListener(CV_UPLOAD_TERMINAL_EVENT, onTerminal)
    }
  }, [finishUploadSuccess])

  async function handleUpload(file: File) {
    if (!token) return
    if (uploadInFlightRef.current) return  // double-fire guard
    const existingJobId = getPersistedCVUploadJobId()
    if (existingJobId) {
      setActiveUploadJobId(existingJobId)
      setShowUpload(true)
      return
    }
    setLastUploadMeta({ name: file.name, type: file.type, size: file.size })

    // Client-side preflight — catches wrong-format files before any network round-trip
    const preflight = await preflightCVUploadFile(file)
    if (!preflight.ok) {
      setUploadError(preflight.message)
      setShowUpload(true)
      recordCVUploadPickRejected(token, file, preflight.code, preflight.message)
      return
    }

    uploadInFlightRef.current = true
    setShowUpload(true)
    setUploading(true); setUploadResult(null); setUploadError(null); setUploadDeferred(false)
    setUploadPhase("queued"); setUploadStartedAt(null); setBiggestDrag(null)
    try {
      const { initial } = await beginCVUpload(token, file, "pdf_upload")
      if (initial.status === "done") {
        finishUploadSuccess({
          skills_detected: initial.skills_detected,
          score: initial.score,
          xp_charged: initial.xp_charged,
          new_coin_balance: null,
          redirect_to: initial.redirect_to,
        })
      } else if (initial.status === "processing") {
        // Acceptance ends the blocking interaction. AppShell tracks the durable
        // job while the user closes this dialog or navigates anywhere in Myro.
        setActiveUploadJobId(initial.job_id)
        setUploadPhase("queued")
        setUploadStartedAt(new Date().toISOString())
      } else {
        throw new CVUploadFailure(
          initial.error_detail ?? "CV analysis could not start.",
          initial.error_code ?? "unknown",
          initial.xp_refunded ?? false,
          initial.new_coin_balance ?? null,
        )
      }
    } catch (err) {
      if (isDeferrableUpload(err)) {
        // Radio dropped mid-upload. The file is held; auto-resume on reconnect.
        // Calm, no failure wall, no fallback escalation (CVUP weak-radio path).
        setUploadDeferred(true)
        setLastFailureCode(err.code)
      } else if (err instanceof CVUploadFailure) {
        if (err.newXpBalance != null) applyXpChange({ newBalance: err.newXpBalance, action: "cv_upload_refund" })
        setLastFailureCode(err.code)
        setUploadError(tokenizedUserMessage(err.message))
        setUploadFailureCount((n) => n + 1)
      } else {
        setLastFailureCode("upload_unknown_error")
        setUploadError(err instanceof Error ? tokenizedUserMessage(err.message) : "Could not upload CV")
        setUploadFailureCount((n) => n + 1)
      }
    } finally {
      setUploading(false)
      uploadInFlightRef.current = false
    }
  }

  // Resume a flaky-radio-interrupted upload from the durable file stash. Shared
  // by the `online` listener and the next-app-load effect. Re-deferring on a
  // fresh interrupt keeps it calm — no failure-count escalation, no fallback.
  async function resumeDeferredUpload() {
    if (!token) return
    if (uploadInFlightRef.current) return
    if (typeof navigator !== "undefined" && navigator.onLine === false) return
    // Check BEFORE opening the modal — an `online` reconnect fires on every
    // wifi blip/laptop wake regardless of what the user is doing, and
    // resumePendingCVUpload() resolves null (nothing to do) with no code path
    // to close a dialog that was opened speculatively. That left a blank
    // "Replace your Main CV" dropzone stuck open over whatever the user was
    // actually working on. Gate on real pending state first, same as the
    // mount-time resume effect below.
    const pending = await hasPendingCVUpload(jwtSub(token))
    if (!pending || uploadInFlightRef.current) return
    uploadInFlightRef.current = true
    setShowUpload(true)
    setUploading(true); setUploadResult(null); setUploadError(null); setUploadDeferred(false)
    setUploadPhase("queued"); setUploadStartedAt(null); setBiggestDrag(null)
    try {
      const result = await resumePendingCVUpload(token, (s) => {
        setUploadPhase(s.current_phase ?? null)
        if (s.started_at) setUploadStartedAt(s.started_at)
      })
      if (!result) return  // nothing pending (already resumed elsewhere)
      finishUploadSuccess(result)
    } catch (err) {
      if (isDeferrableUpload(err)) {
        setUploadDeferred(true)
        setLastFailureCode(err.code)
      } else if (err instanceof CVUploadFailure) {
        if (err.newXpBalance != null) applyXpChange({ newBalance: err.newXpBalance, action: "cv_upload_refund" })
        setLastFailureCode(err.code)
        setUploadError(tokenizedUserMessage(err.message))
        setUploadFailureCount((n) => n + 1)
      } else {
        setLastFailureCode("upload_unknown_error")
        setUploadError(err instanceof Error ? tokenizedUserMessage(err.message) : "Could not upload CV")
        setUploadFailureCount((n) => n + 1)
      }
    } finally {
      setUploading(false)
      uploadInFlightRef.current = false
    }
  }

  async function handleClaimPendingAnonCv() {
    if (!token) return
    if (uploadInFlightRef.current) return
    uploadInFlightRef.current = true
    setShowUpload(true)
    setUploading(true); setUploadResult(null); setUploadError(null); setUploadDeferred(false)
    setUploadPhase("queued"); setUploadStartedAt(null); setBiggestDrag(null)
    try {
      const claim = await claimPendingAnonCv(token)
      if (claim.claimed) finishUploadSuccess(claim.result)
      else openFilePicker()
    } catch (err) {
      if (isDeferrableUpload(err)) {
        setUploadDeferred(true)
        setLastFailureCode(err.code)
      } else if (err instanceof CVUploadFailure) {
        if (err.newXpBalance != null) applyXpChange({ newBalance: err.newXpBalance, action: "cv_upload_refund" })
        setLastFailureCode(err.code)
        setUploadError(tokenizedUserMessage(err.message))
      } else {
        setLastFailureCode("upload_unknown_error")
        setUploadError(err instanceof Error ? tokenizedUserMessage(err.message) : "Could not save CV")
      }
      setUploadFailureCount((n) => n + 1)
    } finally {
      setUploading(false)
      uploadInFlightRef.current = false
    }
  }

  function openEdit(versionId: number) {
    const v = playground.threadVersions.find(x => x.id === versionId)
    if (!v?.polished_text) return
    setEditTarget({ versionId, text: v.polished_text })
    setEditDraft(v.polished_text)
    setEditOpen(true)
  }

  function submitEdit() {
    if (!editTarget) return
    if (editTarget.text === editDraft) { setEditOpen(false); return }
    playground.editVersion.mutate(
      { versionId: editTarget.versionId, edits: { [editTarget.text]: editDraft } },
      { onSuccess: () => { setEditOpen(false); setEditTarget(null); setEditDraft("") } },
    )
  }

  async function requestUploadFallback() {
    if (!token) return
    setFallbackSubmitting(true)
    setFallbackError(null)
    try {
      const payload = await cv.requestUploadFallback(token, {
        attempts: Math.max(1, uploadFailureCount),
        reason_code: lastFailureCode || "upload_unknown_error",
        last_error: uploadError ?? undefined,
        file_name: lastUploadMeta?.name,
        file_mime: lastUploadMeta?.type,
        file_size_bytes: lastUploadMeta?.size,
        route: "/cv",
      })
      setFallbackReceipt(payload)
    } catch (err) {
      setFallbackError(err instanceof Error ? err.message : "Could not open alternate submission path.")
    } finally {
      setFallbackSubmitting(false)
    }
  }

  // Auto-open the upload picker when arriving with ?upload=1. This is the
  // FIRST-upload flow (anonymous visitor → signup → /cv?upload=1). A returning
  // user who already has a Main CV can land here too (postAuthDestination sends
  // anyone carrying a stashed anon CV) — they must NOT be auto-prompted to
  // replace it. Replacing the Main CV is a deliberate act
  // via the top-right "Update Main CV" button, never automatic.
  // Once-only — the URL is normalised after firing so a refresh doesn't re-trigger.
  const autoUploadFiredRef = useRef(false)
  useEffect(() => {
    if (!ready || !token || autoUploadFiredRef.current) return
    if (searchParams.get("upload") !== "1") return
    // Wait for versions to load before deciding — a transient empty baselines[]
    // during fetch would otherwise false-fire the picker for an existing user.
    if (playground.versionsLoading) return
    autoUploadFiredRef.current = true
    if (!hasBaseline) {
      // Claim the browser-local preview CV first; otherwise fall back to picker.
      if (hasPendingAnonCvClaim()) void handleClaimPendingAnonCv()
      else openFilePicker()
    }
    const uploadJobId = searchParams.get("jobId")?.trim()
    router.replace(uploadJobId ? `/cv?jobId=${encodeURIComponent(uploadJobId)}` : "/cv", { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, searchParams, playground.versionsLoading, hasBaseline])

  // Rejoin the shell-owned lifecycle when /cv is opened during an analysis.
  useEffect(() => {
    if (!token || !ready) return
    const persistedJobId = getPersistedCVUploadJobId()
    if (!persistedJobId) return
    setShowUpload(true); setUploadError(null)
    setActiveUploadJobId(persistedJobId)
    setUploadPhase("queued"); setUploadStartedAt(null); setBiggestDrag(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready])

  // Resume a flaky-radio-interrupted upload (phase-1 POST never landed → no
  // job_id, only the durable file stash). On next app load: if a pending file
  // exists, resume immediately when online, or show the calm "we'll finish when
  // you're back online" state when offline. The job_id resume above owns the
  // landed-but-parsing case, so skip when a job_id is present.
  useEffect(() => {
    if (!token || !ready || uploadInFlightRef.current) return
    if (getPersistedCVUploadJobId()) return
    let cancelled = false
    void (async () => {
      const pending = await hasPendingCVUpload(jwtSub(token))
      if (cancelled || !pending || uploadInFlightRef.current) return
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setShowUpload(true); setUploadDeferred(true)
        return
      }
      void resumeDeferredUpload()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready])

  // Auto-resume the instant the radio comes back (the calm-deferred recovery).
  useEffect(() => {
    if (!token || !ready) return
    function onOnline() { void resumeDeferredUpload() }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready])

  // Single source of truth for "is the page bootstrapped enough to show content?".
  // `hasBaseline` is derived from versionsQuery, so the empty / library / playground
  // branches below are only honest once that query has SETTLED — an in-flight
  // versionsQuery means baselines[] is transiently empty, which is "unknown", not
  // "no CV". Showing the empty state in that window asserts a false fact to a
  // veteran ("No CV uploaded yet") → distress. Same invariant the auto-upload
  // picker effect guards with `if (playground.versionsLoading) return`; both sites
  // must wait for versions before deciding. `versionsLoading` is React Query
  // `isLoading` (first load, no cache) — not `isFetching` — so background refetches
  // never re-trigger the skeleton.
  const bootstrapping = !ready || profileQuery.isLoading || playground.versionsLoading
  if (bootstrapping) return <CvSkeleton />

  // A CV is in the pipe: either transferring right now, or landed and parsing on
  // the server (job id persisted, modal closable). The empty state below must not
  // assert "No CV yet" or re-offer Upload in that window — the user just handed
  // one over, and the anon-claim landing (/cv?upload=1) hits this every time.
  const uploadBusy = uploading || !!activeUploadJobId

  const displayedUploadError = uploadError ? tokenizedUserMessage(uploadError) : null
  const surfacedError = playground.error ? tokenizedUserMessage(playground.error) : displayedUploadError

  return (
    <>
      <div className="cvb-scope">
        {/* LibraryView is a self-contained full-bleed surface that owns its own
            padding (tm-lib-main); when it renders, the page wrapper goes flush
            so the two don't stack a double inset (the dead gap above the toggle). */}
        <div className={`cvb-page${hasBaseline && view === "baseline" ? " cvb-page--flush" : ""}`}>
          {/* No baseline yet — onboarding empty state */}
          {!hasBaseline && (
            <>
              <div className="cvb-page-head">
                <div>
                  <h1 className="cvb-page-title">
                    {uploadBusy ? "Reading your CV" : "Upload your Main CV"}
                  </h1>
                  <p className="cvb-page-sub">
                    {uploadBusy
                      ? "This takes about a minute. You can keep using Myro while it runs."
                      : "This is the CV Myro reads. Every tailored copy starts from it."}
                  </p>
                </div>
                {/* No second upload door while one CV is already in the pipe —
                    offering the action the user just took reads as a lost file. */}
                {!uploadBusy && (
                  <Button onClick={openFilePicker}>
                    <Icon name="download" size={14} style={{ transform: "rotate(180deg)" }}/> Upload Main CV
                  </Button>
                )}
              </div>
              <div style={{
                padding: 48, textAlign: "center",
                color: "var(--tm-text-faint)",
                border: "1px dashed var(--tm-border-soft)",
                borderRadius: 16,
                background: "var(--tm-surface)",
              }}>
                <Icon name="file" size={28} style={{ color: "var(--tm-interactive)", marginBottom: 12 }}/>
                <div style={{ fontSize: 16, color: "var(--tm-text)", marginBottom: 6 }}>
                  {uploadBusy ? "Your CV is with Myro" : "No CV yet"}
                </div>
                <div style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>
                  {uploadBusy
                    ? "Your score lands here the moment it is ready."
                    : "Myro reads it, scores it, and tailors a copy for each job you save."}
                </div>
              </div>
            </>
          )}

          {hasBaseline && (
            view === "baseline"
            || (view === "master-edit" && !cvData)
            || (view === "playground" && !!jobId && !cvData)
          ) && (
            <LibraryView
              token={token!}
              cv={cvData}
              currentBaseline={playground.currentBaseline}
              applications={applicationsQuery.data ?? []}
              profile={profileQuery.data ?? null}
              onOpenJob={openJob}
              onReplaceCV={openFilePicker}
              onEditMaster={openMasterEdit}
            />
          )}

          {hasBaseline && view === "master-edit" && cvData && (
            <MasterWorkspace
              token={token!}
              baseline={playground.currentBaseline}
              cv={cvData}
              profile={profileQuery.data ?? null}
              onDone={backToBaseline}
            />
          )}

          {hasBaseline && view === "playground" && jobId && cvData && (
            <PlaygroundView
              token={token!}
              jobId={jobId}
              playground={playground}
              cv={cvData}
              profile={profileQuery.data ?? null}
              onBackToBaseline={backToBaseline}
              onExportPDF={openPdf}
              onEditPolished={openEdit}
              externalError={surfacedError}
              focusSkill={focusSkill}
              mentorRequested={mentorRequested}
            />
          )}

          {playground.versionsError && !hasBaseline && !bodyText && (
            <CvStructuredRecovery
              isRetrying={playground.versionsLoading}
              onRetry={() => { playground.refetchVersions() }}
            />
          )}

          {playground.versionsLoading && !hasBaseline && !playground.versionsError && (
            <CvDocumentSkeleton />
          )}
        </div>
      </div>

      {/* Persistent file input — outside Dialog so mobile picker resume never unmounts it */}
      <input
        ref={fileInputRef}
        id="cv-upload-input"
        type="file"
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
        style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none", left: -9999, top: -9999 }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) handleUpload(f)
        }}
      />

      {/* Upload modal */}
      <Dialog
        open={showUpload}
        onOpenChange={(o) => {
          if (uploading) return
          setShowUpload(o)
          if (!o) {
            setUploadResult(null)
            if (!activeUploadJobId) { setUploadPhase(null); setUploadStartedAt(null) }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasBaseline ? "Replace your Main CV" : "Upload your Main CV"}</DialogTitle>
            <DialogDescription>
              {hasBaseline
                ? "This becomes your new Main CV. Existing tailored CVs stay in your library."
                : "Myro pulls out your skills and splits the CV into sections you can edit."}
            </DialogDescription>
          </DialogHeader>
          {uploading || activeUploadJobId || uploadResult ? (
            <>
              <CvScoreProgress
                status={uploadResult ? "done" : "processing"}
                phase={uploadPhase}
                startedAt={uploadStartedAt}
                done={uploadResult ? {
                  score: Math.round(uploadResult.score),
                  skillsDetected: uploadResult.skills_detected,
                  biggestDragDomain: biggestDrag,
                  reveal: cvData ? {
                    fixCount: runContentChecks(cvData).length,
                    strongDomain: strongWeakFromCache().strong,
                    weakDomain: strongWeakFromCache().weak,
                  } : undefined,
                  downloadSlot: token ? (
                    <DownloadCVButton
                      token={token}
                      baseline={playground.currentBaseline}
                      cv={cvData}
                      fullName={profileQuery.data?.full_name}
                      className="csp-done-download"
                      label="Download your CV"
                    />
                  ) : null,
                } : null}
              />
              {activeUploadJobId && !uploading && (
                <div className="cvb-upload-continue" role="status">
                  <span>We’ll notify you here when your score is ready.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowUpload(false); router.push("/market") }}
                  >
                    Browse jobs
                  </Button>
                </div>
              )}
              {uploadResult?.skills_detected === 0 && (
                <div style={{
                  marginTop: 14, padding: "12px 14px",
                  borderLeft: "2px solid var(--tm-interactive)",
                  borderRadius: "var(--tm-radius-sm)",
                  background: "var(--tm-int-bg-subtle)",
                  fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.55,
                }}>
                  <div style={{ fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>
                    No skills found — try this, then re-upload:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                    <li>Name your tools and technologies — e.g. Python, Figma, SQL.</li>
                    <li>List bullet-point achievements, not just job titles.</li>
                    <li>Add a dedicated Skills section before re-uploading.</li>
                  </ul>
                </div>
              )}
            </>
          ) : uploadDeferred ? (
            <div className="cvb-upload-deferred" role="status">
              <span className="cvb-upload-deferred-icon"><Icon name="upload" size={20} /></span>
              <div className="cvb-upload-deferred-title">Saved — we&rsquo;ll finish when you&rsquo;re back online</div>
              <p className="cvb-upload-deferred-body">
                Weak signal interrupted the upload. We&rsquo;re holding{" "}
                {lastUploadMeta?.name ? <strong>{lastUploadMeta.name}</strong> : "your CV"} and it
                uploads itself the moment your connection returns. You can keep using Myro.
              </p>
              <button
                type="button"
                className="cvb-upload-deferred-retry"
                onClick={() => void resumeDeferredUpload()}
              >
                Try now
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                autoFocus
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragActive(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleUpload(f)
                }}
                className={`cvb-upload-drop${dragActive ? " is-drag" : ""}${displayedUploadError ? " is-error" : ""}`}
              >
                <span className="cvb-upload-icon"><Icon name="upload" size={22} /></span>
                <span className="cvb-upload-label">
                  {displayedUploadError ? "Pick another file" : "Drop your CV here, or click to browse"}
                </span>
                <span className="cvb-upload-formats">PDF or DOCX · up to 10MB</span>
              </button>
              {displayedUploadError && (
                <div style={{
                  marginTop: 10, padding: "8px 12px",
                  border: "1px solid var(--tm-border-soft)",
                  borderRadius: "var(--tm-radius-sm)",
                  color: "var(--tm-text)", fontSize: 12,
                }}>
                  <div>{displayedUploadError}</div>
                  {displayedUploadError.toLowerCase().startsWith("out of tokens") && (
                    <button
                      type="button"
                      onClick={() => router.push("/practice")}
                      style={{
                        marginTop: 8, padding: 0, background: "none", border: "none",
                        color: "var(--tm-interactive)", fontSize: 12, cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Earn 50 Myro Coins from a practice session →
                    </button>
                  )}
                </div>
              )}
              {uploadFailureCount >= 3 && (
                <div style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--tm-radius-sm)",
                  border: "1px solid var(--tm-int-border)",
                  background: "var(--tm-int-bg-wash)",
                }}>
                  <div style={{ fontSize: 12, color: "var(--tm-text)", marginBottom: 8 }}>
                    Still blocked after multiple tries? Open alternate submission fallback.
                  </div>
                  <button
                    type="button"
                    onClick={requestUploadFallback}
                    disabled={fallbackSubmitting}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--tm-radius-sm)",
                      border: "none",
                      background: "var(--tm-interactive)",
                      color: "var(--tm-interactive-fg)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: fallbackSubmitting ? "not-allowed" : "pointer",
                      opacity: fallbackSubmitting ? 0.72 : 1,
                    }}
                  >
                    {fallbackSubmitting ? "Opening fallback…" : "Get alternate submission link"}
                  </button>
                  {fallbackError && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--tm-danger)" }}>{fallbackError}</div>
                  )}
                  {fallbackReceipt && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--tm-text)" }}>
                      Ticket {fallbackReceipt.support_token} created.{" "}
                      <a
                        href={fallbackReceipt.alternate_submission_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--tm-interactive)", textDecoration: "none" }}
                      >
                        Open alternate submission ↗
                      </a>
                    </div>
                  )}
                </div>
              )}
              <div className="cvb-upload-foot">
                {/* Picker troubleshooting — progressive, surfaces only on demand
                    (native greyed-out picker produces no error to gate on). */}
                <button
                  type="button"
                  className="cvb-upload-hint-toggle"
                  aria-expanded={showPickerHint}
                  onClick={() => setShowPickerHint((v) => !v)}
                >
                  Can&apos;t select your file?
                </button>
                {showPickerHint && (
                  <p className="cvb-upload-hint-body">
                    If files look greyed out, click <em>Options</em> (bottom-left of the picker) and switch the file-type dropdown to <em>All Files</em>.
                  </p>
                )}
                {/* Privacy clarity before upload — beta-1 P0 trust signal. */}
                <p className="cvb-upload-privacy">
                  Only you can see your CV.{" "}
                  <a href="/security" target="_blank" rel="noopener noreferrer">
                    How we handle your data ↗
                  </a>
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit polished modal */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditTarget(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit CV text</DialogTitle>
            <DialogDescription>
              Edits save a new copy. Your Main CV stays untouched.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            spellCheck
            style={{
              width: "100%", minHeight: 320, padding: 12,
              fontFamily: "var(--tm-font-mono)", fontSize: 12.5, lineHeight: 1.7,
              background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
              color: "var(--tm-text)", borderRadius: "var(--tm-radius-sm)",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Button variant="outline" size="md" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="solid" size="md" onClick={submitEdit} loading={playground.editVersion.isPending}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function CVPageWithSuspense() {
  return (
    <Suspense fallback={<CvSkeleton />}>
      <CVPage />
    </Suspense>
  )
}
