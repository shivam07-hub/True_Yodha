"use client"

import Link from "next/link"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CVUploadProcessing } from "@/components/cv/upload-processing"
import { CVPlayground } from "@/components/cv/cv-playground"
import { CVVersionLedger } from "@/components/cv/version-ledger"
import { VersionPicker } from "@/components/cv/version-picker"
import { CVCommitPane } from "@/components/cv/cv-commit-pane"
import { cv, jobs, uploadCV } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { renderBaselineDisplayText } from "@/lib/cv-compose"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCVPlayground } from "@/lib/hooks/use-cv-playground"

function CVPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")
  const skillFocus = searchParams.get("skill")

  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ skills_detected: number; score: number } | null>(null)
  const [selectedLedgerVersionId, setSelectedLedgerVersionId] = useState<number | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{ versionId: number; text: string } | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [uploadError, setUploadError] = useState<string | null>(null)

  const playground = useCVPlayground({ token, jobId, enabled: !!ready && !!token })

  const allVersions = playground.allVersions
  const baselines = playground.baselines
  const currentBaseline = playground.currentBaseline
  const threadVersions = playground.threadVersions
  const hasBaseline = baselines.length > 0

  const jobPathQuery = useQuery({
    queryKey: dataKeys.jobPath(jobId),
    queryFn: () => jobs.path(token!, jobId!),
    enabled: !!token && !!jobId,
    staleTime: 5 * 60 * 1000,
  })

  const skillGapQuery = useQuery({
    queryKey: dataKeys.skillGap(jobId),
    queryFn: () => jobs.skillGap(token!, jobId!),
    enabled: !!token && !!jobId,
    staleTime: 5 * 60 * 1000,
  })

  // Ledger selection (only used in no-jobId mode). Picks current baseline as default.
  useEffect(() => {
    if (jobId || !hasBaseline) return
    const selectedStillExists = selectedLedgerVersionId != null
      && allVersions.some(v => v.id === selectedLedgerVersionId)
    if (selectedStillExists) return
    setSelectedLedgerVersionId(currentBaseline?.id ?? allVersions[0]?.id ?? null)
  }, [allVersions, currentBaseline, hasBaseline, jobId, selectedLedgerVersionId])

  const downloadPdf = useMutation({
    mutationFn: (text: string) => cv.downloadPdf(token!, text),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "myro_cv.pdf"
      a.click()
      URL.revokeObjectURL(url)
    },
    onError: (err) => setUploadError(err instanceof Error ? err.message : "Could not generate PDF."),
  })

  async function handleUpload(file: File) {
    if (!token) return
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
    const v = threadVersions.find(x => x.id === versionId)
    if (!v?.polished_text) return
    setEditTarget({ versionId, text: v.polished_text })
    setEditDraft(v.polished_text)
    setEditOpen(true)
  }

  function submitEdit() {
    if (!editTarget) return
    const original = editTarget.text
    const next = editDraft
    if (original === next) { setEditOpen(false); return }
    playground.editVersion.mutate(
      { versionId: editTarget.versionId, edits: { [original]: next } },
      {
        onSuccess: () => {
          setEditOpen(false)
          setEditTarget(null)
          setEditDraft("")
        },
      },
    )
  }

  const baselineDisplayText = renderBaselineDisplayText(
    currentBaseline?.body_text,
    playground.structuredQuery.data,
  )

  if (!ready) return null

  const selectedVersion = playground.selectedVersion
  const isDirty = playground.isDirty
  const paneMode: "unsaved" | "saved" = isDirty ? "unsaved" : "saved"
  const paneText = isDirty
    ? playground.livePreviewText
    : (selectedVersion?.polished_text ?? selectedVersion?.body_text ?? "")
  const surfacedError = playground.error ?? uploadError

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "24px 32px 48px", minHeight: "100vh" }}>

        {/* Header */}
        <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="tm-label-caps" style={{ marginBottom: 4 }}>app/CV_Builder</div>
            <h1 className="tm-title" style={{ fontSize: "var(--tm-fs-heading)", marginBottom: 4 }}>
              {jobId ? "Tailor your CV for this job" : "Your baseline CV"}
            </h1>
            {hasBaseline && jobId && (
              <p className="tm-meta" style={{ fontSize: 12 }}>
                Pick what stays. Save a commit. Polish with AI. Edit polished bullets.
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {hasBaseline && (
              <Button variant="outline" size="md" onClick={() => setShowUpload(true)}>
                Rework CV Baseline
              </Button>
            )}
            {!hasBaseline && (
              <Button variant="solid" size="md" onClick={() => setShowUpload(true)}>
                Upload baseline CV
              </Button>
            )}
          </div>
        </div>

        {surfacedError && (
          <div role="alert" style={{ marginBottom: 12, padding: "8px 12px", fontSize: 12, color: "var(--tm-danger)", border: "1px solid var(--tm-danger)", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-danger-wash)" }}>
            {surfacedError}
          </div>
        )}

        {/* Mode 1 — no baseline */}
        {!hasBaseline && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--tm-text-faint)", border: "1px dashed var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)" }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.6 }}>◈</div>
            <div style={{ fontSize: 16, color: "var(--tm-text)" }}>No CV uploaded yet</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Upload to extract skills, see your Myro Score, and start tailoring per job.</div>
          </div>
        )}

        {/* Mode 2 — baseline but no jobId */}
        {hasBaseline && !jobId && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{
              padding: 16, borderRadius: "var(--tm-radius-lg)",
              border: "1px solid var(--tm-accent-ring)", background: "var(--tm-accent-wash)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
            }}>
              <div>
                <div className="tm-label-caps" style={{ color: "var(--tm-accent)", marginBottom: 4 }}>Tailoring is per-company</div>
                <div style={{ fontSize: 13, color: "var(--tm-text)" }}>
                  Pick a target job to open its Company CV Thread. Every saved version is immutable, like a Git commit.
                </div>
              </div>
              <Button variant="solid" size="md" render={<Link href="/tracker?stage=saved" />}>Pick a target job →</Button>
            </div>
            <CVVersionLedger
              versions={allVersions}
              selectedId={selectedLedgerVersionId}
              onSelect={setSelectedLedgerVersionId}
              baselineDisplayText={baselineDisplayText}
              highlightSkill={skillFocus}
            />
          </div>
        )}

        {/* Mode 3 — playground + commit pane */}
        {hasBaseline && jobId && (
          <>
            {playground.structuredQuery.isLoading && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
                Parsing your CV into sections…
              </div>
            )}
            {playground.structuredQuery.isError && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--tm-danger)", fontSize: 12 }}>
                Couldn&apos;t load your CV structure. Try refreshing in a minute.
              </div>
            )}
            {playground.structuredQuery.data && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
                <div>
                  <CVPlayground
                    cv={playground.structuredQuery.data}
                    hiddenItems={playground.hiddenItems}
                    onToggle={playground.toggleItem}
                    targetSkills={skillGapQuery.data?.skills ?? []}
                    jobTitle={jobPathQuery.data?.job_title}
                    companyName={jobPathQuery.data?.company ?? undefined}
                  />
                  <div style={{
                    position: "sticky", bottom: 0, marginTop: 12,
                    padding: "12px 14px", borderRadius: "var(--tm-radius-lg)",
                    background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  }}>
                    <span style={{ fontSize: 11, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)" }}>
                      {playground.hiddenItems.size} hidden · {isDirty ? "unsaved changes" : "in sync with selected version"}
                    </span>
                    <Button
                      variant="solid" size="md"
                      onClick={() => playground.saveVersion.mutate()}
                      disabled={!playground.canSave || playground.saveVersion.isPending}
                      loading={playground.saveVersion.isPending}
                    >
                      Save Version
                    </Button>
                  </div>
                </div>

                <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Picker = secondary switcher above the pane. The pane is the persistent surface. */}
                  <VersionPicker
                    versions={threadVersions}
                    lineageVersions={allVersions}
                    selectedId={playground.selectedVersionId}
                    onSelect={playground.selectVersion}
                    onCreate={() => playground.saveVersion.mutate()}
                    onPolish={(id) => playground.polishVersion.mutate(id)}
                    onEdit={openEdit}
                    onDownload={(text) => downloadPdf.mutate(text)}
                    isCreating={playground.saveVersion.isPending}
                    isPolishing={playground.polishVersion.isPending}
                    canCreate={playground.canSave}
                    hidePreview
                  />
                  <CVCommitPane
                    mode={paneMode}
                    text={paneText}
                    version={isDirty ? null : selectedVersion}
                    threadVersions={threadVersions}
                    onPolish={selectedVersion ? () => playground.polishVersion.mutate(selectedVersion.id) : undefined}
                    isPolishing={playground.polishVersion.isPending}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Upload modal */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
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
            <label
              htmlFor="cv-upload-input"
              style={{
                display: "block", padding: "32px 20px", textAlign: "center",
                border: "1px dashed var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)",
                cursor: "pointer", color: "var(--tm-text-faint)", fontSize: 13,
              }}
            >
              Drop a PDF or DOCX here, or click to choose a file.
              <input
                id="cv-upload-input"
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                style={{ display: "none" }}
              />
            </label>
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
