"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CvScoreProgress } from "@/components/cv/cv-score-progress"
import { DownloadCVButton } from "@/components/cv/download-cv-button"
import { tokenizedUserMessage, type CVUploadPhase } from "@/lib/cv-upload-state"
import { takeStashedFile, takeStashedComposedCvText } from "@/lib/anon-cv-stash"
import { CvSkeleton } from "@/components/loading/page-skeletons"
import { PlaygroundView } from "@/components/cv/builder/playground-view"
import { LibraryView } from "@/components/cv/builder/library-view"
import { Icon } from "@/components/cv/builder/icons"
import {
  CVUploadFailure,
  clearPersistedCVUploadState,
  type CVUploadFallbackSubmissionResponse,
  cv,
  jobs as jobsApi,
  getPersistedCVUploadJobId,
  pollCVUploadStatus,
  uploadCV,
  uploadCVText,
  users,
} from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { preflightCVUploadFile } from "@/lib/cv-file-detect"
import { startCvPromiseOptimistic } from "@/lib/cv-promise"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCVPlayground } from "@/lib/hooks/use-cv-playground"
import { useXPStore } from "@/store/xpStore"
import { useParticleMoment } from "@/components/particle"

import "./cv-fonts.css"
import "./cv-sheet.css"
import "./cv-builder.css"

type ViewMode = "baseline" | "playground"

function CVPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")
  const focusSkill = searchParams.get("skill")

  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ skills_detected: number; score: number } | null>(null)
  // #6 deploy-style loading: live phase + start-time + the done-morph's Improve target.
  const [uploadPhase, setUploadPhase] = useState<CVUploadPhase | null>(null)
  const [uploadStartedAt, setUploadStartedAt] = useState<string | null>(null)
  const [biggestDrag, setBiggestDrag] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
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
  const cvData = playground.structuredQuery.data ?? null

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

  const view: ViewMode = !jobId ? "baseline" : "playground"

  function navigate(href: string) { router.push(href) }
  function openJob(id: string) { navigate(`/cv?jobId=${encodeURIComponent(id)}`) }
  function backToBaseline() { navigate("/cv") }
  // Tailored export is a dedicated full-page route (Design C). Carry the match
  // score so the export header can show the JD-match pill without a refetch.
  function openPdf(matchScore = 0) {
    if (!jobId) return
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
  function lowestDomainFromCache(): string | null {
    const data = queryClient.getQueryData<{ domain_scores?: Record<string, number> }>(dataKeys.scores())
    const ds = data?.domain_scores
    if (!ds) return null
    let lo: string | null = null
    let loVal = Infinity
    for (const [k, v] of Object.entries(ds)) {
      if (typeof v === "number" && v < loVal) { loVal = v; lo = k }
    }
    return lo
  }

  async function handleUpload(file: File) {
    if (!token) return
    if (uploadInFlightRef.current) return  // double-fire guard
    setLastUploadMeta({ name: file.name, type: file.type, size: file.size })

    // Client-side preflight — catches wrong-format files before any network round-trip
    const preflight = await preflightCVUploadFile(file)
    if (!preflight.ok) {
      setUploadError(preflight.message)
      setShowUpload(true)
      return
    }

    uploadInFlightRef.current = true
    setShowUpload(true)
    setUploading(true); setUploadResult(null); setUploadError(null)
    setUploadPhase("queued"); setUploadStartedAt(null); setBiggestDrag(null)
    // Start the 10-min CV-promise clock the instant the upload begins (Q4).
    startCvPromiseOptimistic()
    try {
      const result = await uploadCV(token, file, "pdf_upload", (s) => {
        setUploadPhase(s.current_phase ?? null)
        if (s.started_at) setUploadStartedAt(s.started_at)
      })
      if (result.new_coin_balance != null) applyXpChange({ newBalance: result.new_coin_balance, action: "cv_upload" })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
      queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
      setUploadPhase("ready")
      setBiggestDrag(lowestDomainFromCache())
      setUploadResult({ skills_detected: result.skills_detected, score: result.score })
      setUploadFailureCount(0)
      setLastFailureCode("unknown")
      setFallbackError(null)
      setFallbackReceipt(null)
      // #6: no auto-close — the done-morph holds the score + Improve action
      // until the user acts or dismisses (inline-done, Q4).
    } catch (err) {
      if (err instanceof CVUploadFailure) {
        if (err.newXpBalance != null) applyXpChange({ newBalance: err.newXpBalance, action: "cv_upload_refund" })
        setLastFailureCode(err.code)
        setUploadError(tokenizedUserMessage(err.message))
      } else {
        setLastFailureCode("upload_unknown_error")
        setUploadError(err instanceof Error ? tokenizedUserMessage(err.message) : "Could not upload CV")
      }
      setUploadFailureCount((n) => n + 1)
    } finally {
      setUploading(false)
      uploadInFlightRef.current = false
    }
  }

  // Claim-on-signup for the pre-login PLAYGROUND (grill Q8): the logged-out user
  // built + improved a CV at /cv-preview, hit "Save & download", then signed up.
  // The composed CV text is stashed → replay it to /cv/text so the IMPROVED CV
  // becomes their Main CV (re-parsed + scored server-side). Mirrors handleUpload
  // but for text; uploadCVText polls internally so there's no phase callback.
  async function handleUploadText(text: string) {
    if (!token) return
    if (uploadInFlightRef.current) return
    uploadInFlightRef.current = true
    setShowUpload(true)
    setUploading(true); setUploadResult(null); setUploadError(null)
    setUploadPhase("queued"); setUploadStartedAt(null); setBiggestDrag(null)
    startCvPromiseOptimistic()
    try {
      const result = await uploadCVText(token, text, "text_describe")
      if (result.new_coin_balance != null) applyXpChange({ newBalance: result.new_coin_balance, action: "cv_upload" })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
      queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
      setUploadPhase("ready")
      setBiggestDrag(lowestDomainFromCache())
      setUploadResult({ skills_detected: result.skills_detected, score: result.score })
      setUploadFailureCount(0); setLastFailureCode("unknown"); setFallbackError(null); setFallbackReceipt(null)
    } catch (err) {
      if (err instanceof CVUploadFailure) {
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
  // FIRST-upload flow (anonymous visitor → signup → /cv?upload=1). The ?next=
  // param is carried by every signup CTA and survives a login redirect, so a
  // returning user who already has a Main CV can land here too — they must NOT
  // be auto-prompted to replace it. Replacing the Main CV is a deliberate act
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
      // Claim-on-signup (grill Q8). Priority order:
      //  1. composed playground text — the user BUILT + improved a CV at
      //     /cv-preview then chose "Save & download". sessionStorage survives the
      //     signup redirect, so this is the most resilient path. Replay → /cv/text.
      //  2. in-memory scored File — they scored on the landing and signed up in
      //     the same SPA tab (email/pw). Replay it to the real upload, no re-pick.
      //  3. neither (e.g. OAuth full-page redirect dropped the File) → open the
      //     picker, the original first-upload flow.
      const composed = takeStashedComposedCvText()
      const stashed = takeStashedFile()
      if (composed) void handleUploadText(composed)
      else if (stashed) void handleUpload(stashed)
      else openFilePicker()
    }
    router.replace("/cv", { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, searchParams, playground.versionsLoading, hasBaseline])

  // Resume an upload that was in flight when the tab closed / page reloaded.
  // The job is server-side; polling reconciles its terminal state.
  useEffect(() => {
    if (!token || !ready || uploadInFlightRef.current) return
    const persistedJobId = getPersistedCVUploadJobId()
    if (!persistedJobId) return
    uploadInFlightRef.current = true
    setShowUpload(true); setUploading(true); setUploadError(null)
    setUploadPhase("queued"); setUploadStartedAt(null); setBiggestDrag(null)
    pollCVUploadStatus(token, persistedJobId, {
      onProgress: (s) => {
        setUploadPhase(s.current_phase ?? null)
        if (s.started_at) setUploadStartedAt(s.started_at)
      },
    })
      .then((result) => {
        if (result.new_coin_balance != null) applyXpChange({ newBalance: result.new_coin_balance, action: "cv_upload" })
        queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
        queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
        queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
        queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
        queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
        setUploadPhase("ready")
        setBiggestDrag(lowestDomainFromCache())
        setUploadResult({ skills_detected: result.skills_detected, score: result.score })
        setUploadFailureCount(0)
        clearPersistedCVUploadState()
        // #6: no auto-close — done-morph holds the score + Improve action.
      })
      .catch((err) => {
        if (err instanceof CVUploadFailure) {
          if (err.newXpBalance != null) applyXpChange({ newBalance: err.newXpBalance, action: "cv_upload_refund" })
          setLastFailureCode(err.code)
          if (!err.retryable) clearPersistedCVUploadState()
        } else {
          setLastFailureCode("upload_unknown_error")
          clearPersistedCVUploadState()
        }
        setUploadFailureCount((n) => n + 1)
        setUploadError(err instanceof Error ? tokenizedUserMessage(err.message) : "Upload could not be resumed.")
      })
      .finally(() => {
        setUploading(false)
        uploadInFlightRef.current = false
      })
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

  const displayedUploadError = uploadError ? tokenizedUserMessage(uploadError) : null
  const surfacedError = playground.error ? tokenizedUserMessage(playground.error) : displayedUploadError

  return (
    <>
      <div className="cvb-scope">
        <div className="cvb-page">
          {/* No baseline yet — onboarding empty state */}
          {!hasBaseline && (
            <>
              <div className="cvb-page-head">
                <div>
                  <h1 className="cvb-page-title">Add your Main CV</h1>
                  <p className="cvb-page-sub">
                    Keep the CV you already use, then let Myro organize tailored copies for each job.
                  </p>
                </div>
                <button type="button" className="cvb-btn primary" onClick={openFilePicker}>
                  <Icon name="download" size={14} style={{ transform: "rotate(180deg)" }}/> Upload Main CV
                </button>
              </div>
              <div style={{
                padding: 48, textAlign: "center",
                color: "var(--tm-text-faint)",
                border: "1px dashed var(--tm-border-soft)",
                borderRadius: 16,
                background: "var(--tm-surface)",
              }}>
                <Icon name="file" size={28} style={{ color: "var(--tm-interactive)", marginBottom: 12 }}/>
                <div style={{ fontSize: 16, color: "var(--tm-text)", marginBottom: 6 }}>No CV uploaded yet</div>
                <div style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>
                  Upload to extract skills, see your Myro Score, and start tailoring per job.
                </div>
              </div>
            </>
          )}

          {hasBaseline && view === "baseline" && (
            <LibraryView
              token={token!}
              cv={cvData}
              versions={playground.allVersions}
              currentBaseline={playground.currentBaseline}
              applications={applicationsQuery.data ?? []}
              profile={profileQuery.data ?? null}
              onOpenJob={openJob}
              onReplaceCV={openFilePicker}
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
            />
          )}

          {hasBaseline && view === "playground" && jobId && !cvData && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
              Loading your CV…
            </div>
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
          if (!o) { setUploadResult(null); setUploadPhase(null); setUploadStartedAt(null) }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasBaseline ? "Replace your Main CV" : "Upload your Main CV"}</DialogTitle>
            <DialogDescription>
              {hasBaseline
                ? "This becomes your new Main CV. Existing tailored CVs stay in your library."
                : "We identify your skills, map them to 32,000+ recognized skill types used by real hiring managers, and parse your CV into sections."}
            </DialogDescription>
          </DialogHeader>
          {uploading || uploadResult ? (
            <>
              <CvScoreProgress
                status={uploadResult ? "done" : "processing"}
                phase={uploadPhase}
                startedAt={uploadStartedAt}
                done={uploadResult ? {
                  score: Math.round(uploadResult.score),
                  skillsDetected: uploadResult.skills_detected,
                  biggestDragDomain: biggestDrag,
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
                      onClick={() => router.push("/forge")}
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
                  Your CV is private by default.{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer">
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
    <Suspense fallback={null}>
      <CVPage />
    </Suspense>
  )
}
