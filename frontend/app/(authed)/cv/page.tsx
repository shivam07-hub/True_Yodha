"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CVUploadProcessing } from "@/components/cv/upload-processing"
import { PlaygroundView } from "@/components/cv/builder/playground-view"
import { PdfPreviewView } from "@/components/cv/builder/pdf-preview-view"
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
  users,
} from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { preflightCVUploadFile } from "@/lib/cv-file-detect"
import { startCvPromiseOptimistic } from "@/lib/cv-promise"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCVPlayground } from "@/lib/hooks/use-cv-playground"
import { useXPStore } from "@/store/xpStore"

import "./cv-builder.css"

type ViewMode = "baseline" | "playground" | "pdf"

function CVPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")
  const wantsPdf = searchParams.get("view") === "pdf"
  const focusSkill = searchParams.get("skill")

  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ skills_detected: number; score: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadFailureCount, setUploadFailureCount] = useState(0)
  const [lastFailureCode, setLastFailureCode] = useState<string>("unknown")
  const [lastUploadMeta, setLastUploadMeta] = useState<{ name: string; type: string; size: number } | null>(null)
  const [fallbackSubmitting, setFallbackSubmitting] = useState(false)
  const [fallbackError, setFallbackError] = useState<string | null>(null)
  const [fallbackReceipt, setFallbackReceipt] = useState<CVUploadFallbackSubmissionResponse | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Reentry guard: setUploading(true) is async, mobile Chrome can fire change
  // twice; the ref blocks the second call synchronously.
  const uploadInFlightRef = useRef(false)
  const setXPBalance = useXPStore((s) => s.setBalance)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{ versionId: number; text: string } | null>(null)
  const [editDraft, setEditDraft] = useState("")

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

  const view: ViewMode = !jobId ? "baseline" : wantsPdf ? "pdf" : "playground"

  function navigate(href: string) { router.push(href) }
  function openJob(id: string) { navigate(`/cv?jobId=${encodeURIComponent(id)}`) }
  function backToBaseline() { navigate("/cv") }
  function openPdf(matchScore = 0) {
    if (!jobId) return
    if (matchScore > 0) {
      try { sessionStorage.setItem(`myro-cv-score-${jobId}`, String(matchScore)) } catch { /* blocked */ }
    }
    const scoreParam = matchScore > 0 ? `&score=${matchScore}` : ""
    navigate(`/cv?jobId=${encodeURIComponent(jobId)}&view=pdf${scoreParam}`)
  }
  function backToPlayground() {
    if (!jobId) return
    navigate(`/cv?jobId=${encodeURIComponent(jobId)}`)
  }

  function openFilePicker() {
    setShowUpload(true)
    setUploadError(null)
    setFallbackError(null)
    // Defer click so dialog mount doesn't intercept the activation gesture
    requestAnimationFrame(() => fileInputRef.current?.click())
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
    // Start the 10-min CV-promise clock the instant the upload begins (Q4).
    startCvPromiseOptimistic()
    try {
      const result = await uploadCV(token, file)
      if (result.new_xp_balance != null) setXPBalance(result.new_xp_balance)
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
      queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
      setUploadResult({ skills_detected: result.skills_detected, score: result.score })
      setUploadFailureCount(0)
      setLastFailureCode("unknown")
      setFallbackError(null)
      setFallbackReceipt(null)
      setTimeout(() => { setShowUpload(false); setUploadResult(null) }, 2000)
    } catch (err) {
      if (err instanceof CVUploadFailure) {
        if (err.newXpBalance != null) setXPBalance(err.newXpBalance)
        setLastFailureCode(err.code)
        setUploadError(err.message)
      } else {
        setLastFailureCode("upload_unknown_error")
        setUploadError(err instanceof Error ? err.message : "Could not upload CV")
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

  // If user lands directly on ?view=pdf without a baseline, drop them back to baseline.
  useEffect(() => {
    if (view === "pdf" && !hasBaseline) backToBaseline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, hasBaseline])

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
    if (!hasBaseline) openFilePicker()
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
    pollCVUploadStatus(token, persistedJobId)
      .then((result) => {
        if (result.new_xp_balance != null) setXPBalance(result.new_xp_balance)
        queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
        queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
        queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
        queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
        queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
        setUploadResult({ skills_detected: result.skills_detected, score: result.score })
        setUploadFailureCount(0)
        clearPersistedCVUploadState()
        setTimeout(() => { setShowUpload(false); setUploadResult(null) }, 2000)
      })
      .catch((err) => {
        if (err instanceof CVUploadFailure) {
          if (err.newXpBalance != null) setXPBalance(err.newXpBalance)
          setLastFailureCode(err.code)
          if (!err.retryable) clearPersistedCVUploadState()
        } else {
          setLastFailureCode("upload_unknown_error")
          clearPersistedCVUploadState()
        }
        setUploadFailureCount((n) => n + 1)
        setUploadError(err instanceof Error ? err.message : "Upload could not be resumed.")
      })
      .finally(() => {
        setUploading(false)
        uploadInFlightRef.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready])

  if (!ready) return null

  const surfacedError = playground.error ?? uploadError

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
              versions={playground.allVersions}
              currentBaseline={playground.currentBaseline}
              applications={applicationsQuery.data ?? []}
              profile={profileQuery.data ?? null}
              onOpenMaster={openFilePicker}
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

          {hasBaseline && view === "pdf" && jobId && cvData && (
            <PdfPreviewView
              token={token!}
              cv={cvData}
              hidden={playground.hiddenItems}
              selectedVersion={playground.selectedVersion}
              profile={profileQuery.data ?? null}
              company={playground.selectedVersion?.company_name ?? "Selected role"}
              jobTitle={playground.selectedVersion?.job_title ?? ""}
              matchScore={Number(searchParams.get("score") ?? 0)}
              jobId={jobId}
              onBackToPlayground={backToPlayground}
            />
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
        onOpenChange={(o) => { if (uploading) return; setShowUpload(o) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasBaseline ? "Replace your Main CV" : "Upload your Main CV"}</DialogTitle>
            <DialogDescription>
              {hasBaseline
                ? "This becomes your new Main CV. Existing tailored CVs stay in your library."
                : "We extract skills, map them to the Lightcast taxonomy, and parse your CV into sections."}
            </DialogDescription>
          </DialogHeader>
          {uploading || uploadResult ? (
            <CVUploadProcessing success={!!uploadResult} result={uploadResult ?? undefined} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: "block", width: "100%", padding: "32px 20px", textAlign: "center",
                  border: "1px dashed var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)",
                  cursor: "pointer", color: "var(--tm-text-faint)", fontSize: 13,
                  background: "transparent",
                }}
              >
                {uploadError ? "Pick another file" : "Tap to choose a PDF or DOCX from your device."}
              </button>
              {uploadError && (
                <div style={{
                  marginTop: 10, padding: "8px 12px",
                  border: "1px solid var(--tm-border-soft)",
                  borderRadius: "var(--tm-radius-sm)",
                  color: "var(--tm-text)", fontSize: 12,
                }}>
                  <div>{uploadError}</div>
                  {uploadError.startsWith("Out of XP") && (
                    <button
                      type="button"
                      onClick={() => router.push("/diary")}
                      style={{
                        marginTop: 8, padding: 0, background: "none", border: "none",
                        color: "var(--tm-interactive)", fontSize: 12, cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Earn 30 XP in 5min via a diary entry →
                    </button>
                  )}
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--tm-text-faint)" }}>
                Accepted formats: PDF, DOCX · Max size: 10MB
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--tm-text-faint)" }}>
                Files greyed out in the picker? Click <em>Options</em> (bottom-left) and switch the file-type dropdown to <em>All Files</em>.
              </div>
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
              {/* Privacy clarity before upload — beta-1 P0 trust signal. */}
              <p style={{
                marginTop: 12,
                marginBottom: 0,
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--tm-text-faint)",
              }}>
                Your CV is private by default.{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--tm-interactive)", textDecoration: "none" }}
                >
                  How we handle your data ↗
                </a>
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit polished modal */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditTarget(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit polished CV</DialogTitle>
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
              Save copy
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
