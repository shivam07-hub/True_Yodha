"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CVUploadProcessing } from "@/components/cv/upload-processing"
import { BaselineView } from "@/components/cv/builder/baseline-view"
import { PlaygroundView } from "@/components/cv/builder/playground-view"
import { PdfPreviewView } from "@/components/cv/builder/pdf-preview-view"
import { Icon } from "@/components/cv/builder/icons"
import { uploadCV, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCVPlayground } from "@/lib/hooks/use-cv-playground"

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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const ACCEPTED_EXT = /\.(pdf|docx)$/i
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
    // Defer click so dialog mount doesn't intercept the activation gesture
    requestAnimationFrame(() => fileInputRef.current?.click())
  }

  async function handleUpload(file: File) {
    if (!token) return
    if (!ACCEPTED_EXT.test(file.name)) {
      setShowUpload(true)
      setUploadError("Pick a PDF or DOCX file. Other formats aren’t supported yet.")
      return
    }
    setShowUpload(true)
    setUploading(true); setUploadResult(null); setUploadError(null)
    try {
      const result = await uploadCV(token, file)
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
      setUploadResult({ skills_detected: result.skills_detected as number, score: result.score as number })
      setTimeout(() => { setShowUpload(false); setUploadResult(null) }, 2000)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not upload CV")
    } finally {
      setUploading(false)
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

  // If user lands directly on ?view=pdf without a baseline, drop them back to baseline.
  useEffect(() => {
    if (view === "pdf" && !hasBaseline) backToBaseline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, hasBaseline])

  if (!ready) return null

  const surfacedError = playground.error ?? uploadError

  return (
    <AppShell>
      <div className="cvb-scope">
        <div className="cvb-page">
          {/* No baseline yet — onboarding empty state */}
          {!hasBaseline && (
            <>
              <div className="cvb-page-head">
                <div>
                  <h1 className="cvb-page-title">Upload your baseline CV</h1>
                  <p className="cvb-page-sub">
                    The baseline is the trunk of your CV history — every per-job tailored version branches from it.
                  </p>
                </div>
                <button type="button" className="cvb-btn primary" onClick={openFilePicker}>
                  <Icon name="download" size={14} style={{ transform: "rotate(180deg)" }}/> Upload baseline CV
                </button>
              </div>
              <div style={{
                padding: 48, textAlign: "center",
                color: "var(--tm-text-faint)",
                border: "1px dashed var(--tm-border-soft)",
                borderRadius: 16,
                background: "var(--tm-surface)",
              }}>
                <Icon name="file" size={28} style={{ color: "var(--tm-accent)", marginBottom: 12 }}/>
                <div style={{ fontSize: 16, color: "var(--tm-text)", marginBottom: 6 }}>No CV uploaded yet</div>
                <div style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>
                  Upload to extract skills, see your Myro Score, and start tailoring per job.
                </div>
              </div>
            </>
          )}

          {hasBaseline && view === "baseline" && cvData && (
            <BaselineView
              token={token!}
              versions={playground.allVersions}
              currentBaseline={playground.currentBaseline}
              cv={cvData}
              profile={profileQuery.data ?? null}
              onRework={openFilePicker}
              onOpenJob={openJob}
              focusSkill={focusSkill}
            />
          )}

          {hasBaseline && view === "baseline" && !cvData && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
              {playground.structuredQuery.isLoading
                ? "Parsing your CV into sections…"
                : playground.structuredQuery.isError
                  ? "Couldn’t load your CV structure. Try refreshing in a minute."
                  : null}
            </div>
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
            <DialogTitle>{hasBaseline ? "Replace your baseline CV" : "Upload your baseline CV"}</DialogTitle>
            <DialogDescription>
              {hasBaseline
                ? "This becomes your new baseline. Existing per-job versions stay intact."
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
                  {uploadError}
                </div>
              )}
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
              Edits create a new immutable version. Baseline stays untouched.
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
              Save as new version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

export default function CVPageWithSuspense() {
  return (
    <Suspense fallback={null}>
      <CVPage />
    </Suspense>
  )
}
