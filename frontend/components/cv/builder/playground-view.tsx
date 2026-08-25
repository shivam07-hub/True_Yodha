/**
 * PlaygroundView — per-job CV tailoring, on the shared workstation shell.
 *
 * The layout, the triage state and the four visual ranks live in
 * WorkstationShell (hierarchy redesign, handoff 2a). This file supplies only
 * what is job-specific: the header and its two actions, the writes (a rewrite
 * makes a new Main-CV baseline; a hide toggles this job's projection), the
 * Skills lane (Lane C jd_coverage), and Tailor with Mentor.
 *
 * Two header actions, not one: Download is the primary — it is what the user
 * came for and it cannot misfire — and Apply is the ghost beside it, because it
 * opens an external page and arms the apply-capture prompt. The raw JD now
 * opens from the job line itself; the pane toolbar belongs to EDIT/SHEET and
 * the page-fill meter.
 */
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { cv as cvApi, jobs as jobsApi, users } from "@/lib/api"
import { TailorWeave } from "./tailor-weave"
import "./tailor-weave.css"
import { ApplyModal } from "./apply-modal"
import { TrimConfirm } from "./trim-confirm"
import { PlaygroundHeader } from "./playground-header"
import { PdfPage, type PdfPageContact } from "./pdf-page"
import { CoveragePanel } from "./coverage-panel"
import { WorkstationShell } from "./workstation-shell"
import { runAtsChecks } from "./ats-checks"
import { useCvDiagnosis } from "./use-cv-diagnosis"
import { identityLines } from "./cv-identity-lines"
import { rewriteFetcher } from "./rewrite-fetchers"
import { exportSheetPdf } from "@/lib/cv/sheet-pdf"
import { printCvPage } from "@/lib/cv/print-cv"
import { masterFilename } from "@/lib/cv/download-master"
import { DEFAULT_TEMPLATE, isCVTemplate, type CVTemplate } from "@/lib/cv/templates"
import { hasCvContent, latestBaseline } from "@/lib/cv/durable-answer"
import { usePlaygroundModel } from "./use-playground-model"
import { useDismissedFixes } from "./use-dismissed-fixes"
import type { AppliedFix, V2Fix } from "./fix-model"
import { dataKeys, invalidateScoreMapData } from "@/lib/domain-data"
import type { CVPlaygroundState } from "@/lib/hooks/use-cv-playground"
import { DetailDrawer } from "@/components/jobs/detail-drawer"
import { DetailHeader } from "@/components/jobs/detail-header"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { similarRolesHref } from "@/lib/jobs/similar-roles"
import { Icon } from "./icons"

/** Last-picked export template, shared with the master export surface. */
function readTemplatePref(): CVTemplate {
  try {
    const saved = localStorage.getItem("myro-cv-template-v1")
    if (isCVTemplate(saved)) return saved
  } catch { /* storage blocked */ }
  return DEFAULT_TEMPLATE
}

interface PlaygroundViewProps {
  token: string
  jobId: string
  playground: CVPlaygroundState
  cv: CVStructured
  profile: UserProfile | null
  onBackToBaseline: () => void
  onExportPDF: (matchScore: number) => void
  onEditPolished: (versionId: number) => void
  externalError?: string | null
  focusSkill?: string | null
  /** Practice handoff opens the existing deep, evidence-grounded Mentor weave. */
  mentorRequested?: boolean
}

export function PlaygroundView({
  token, jobId, playground, cv, profile,
  onBackToBaseline, externalError, mentorRequested = false,
}: PlaygroundViewProps) {
  const { selectedVersion, hiddenItems, toggleItem, autosaving, autosaved } = playground
  const router = useRouter()
  const queryClient = useQueryClient()
  const [appliedFixes, setAppliedFixes] = useState<AppliedFix[]>([])
  const [weaveOpen, setWeaveOpen] = useState(mentorRequested)
  const [jdOpen, setJdOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [railRequest, setRailRequest] = useState<{ tab: "fixes" | "skills"; n: number } | null>(null)
  const sheetWrapRef = useRef<HTMLDivElement>(null)
  const pendingTemplateRef = useRef<CVTemplate>(DEFAULT_TEMPLATE)

  useEffect(() => { if (mentorRequested) setWeaveOpen(true) }, [mentorRequested])

  const { dismissed, dismiss } = useDismissedFixes(`job:${jobId}`)

  // The ATS filename check tests machine-readability of the slug, and every
  // segment of the real download name is slugged the same way — so the name
  // alone is a faithful stand-in, and it does not drag the job title into the
  // diagnosis inputs (which would re-scan the CV when the job header loads).
  const atsChecks = useMemo(
    () => runAtsChecks(cv, profile, masterFilename(cv.contact?.name ?? profile?.full_name ?? null)),
    [cv, profile],
  )
  // ONE scan of the CV per change, shared by the score model and the shell.
  const diagnosis = useCvDiagnosis({ cv, hidden: hiddenItems, atsChecks, dismissed })

  const m = usePlaygroundModel(token, jobId, cv, profile, hiddenItems, {
    penalty: diagnosis.penalty,
  })
  // Same query key as every other skills reader — one cache entry, no refetch.
  const userSkillsQuery = useQuery({
    queryKey: dataKeys.userSkills(),
    queryFn: () => users.mySkills(token),
    staleTime: 5 * 60 * 1000,
  })
  const coverageQuery = m.coverageQuery

  const pdfContact = useMemo<PdfPageContact>(() => ({
    name: cv.contact?.name?.trim() || profile?.full_name?.trim() || "Your name",
    title: cv.contact?.title?.trim() || cv.experience[0]?.role || "",
    location: cv.contact?.location?.trim() || profile?.target_location || "",
    email: cv.contact?.email?.trim() || profile?.email || "",
    phone: cv.contact?.phone?.trim() || "",
    linkedin: cv.contact?.linkedin?.trim() || profile?.linkedin_url || "",
  }), [cv, profile])
  const pdfFilename = useMemo(() => {
    const slug = (s: string | null | undefined) =>
      (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
    const parts = [slug(pdfContact.name) || "myro_cv", slug(m.company), slug(m.jobTitle)].filter(Boolean)
    return `${parts.join("__")}.pdf`
  }, [pdfContact.name, m.company, m.jobTitle])


  const sourceUrl = m.application?.source_url?.trim() ?? ""
  const capture = useApplyCapture({
    token,
    job: { job_id: jobId, source_url: sourceUrl || null, company: m.company !== "Untitled company" ? m.company : null },
    surface: "other",
    intentSurface: "cv_playground",
    onSubmitted: recordSubmittedCv,
    onFindSimilar: () => router.push(similarRolesHref(m.application?.role_domain)),
  })
  const applyHref = capture.href ?? ""

  // Every id the scan raised, dismissal included — an applied fix drops off the
  // session list only when the defect is genuinely gone from the text.
  const openFixIds = useMemo(
    () => new Set(diagnosis.allFindings.map(f => f.id)),
    [diagnosis.allFindings],
  )
  const appliedShown = appliedFixes.filter(a => !openFixIds.has(a.id))
  const sessionRaised = appliedShown.reduce((s, a) => s + a.gain, 0)

  function invalidateCV() {
    queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
    queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
    invalidateScoreMapData(queryClient)
    queryClient.invalidateQueries({ queryKey: ["cv-gap-plan", jobId] })
  }

  const rewriteApply = useMutation({
    mutationFn: ({ oldText, newText }: { oldText: string; newText: string }) =>
      cvApi.rewriteApply(token, { old_text: oldText, new_text: newText }),
    onSuccess: invalidateCV,
  })

  // Content write-through. Education, certifications and a blank summary are
  // master-owned but they are CONTENT, not identity, so `add ›` fills them from
  // whichever surface the user is on (locked 2026-08-25). Reads the freshest
  // structured CV from cache so rapid edits don't stack on a stale base.
  const patchMaster = useMutation({
    mutationFn: (mut: (draft: CVStructured) => CVStructured) => {
      const cached = queryClient.getQueryData<{ versions: CVVersion[] }>(dataKeys.cvVersions(null))
      const fromCache = latestBaseline(cached?.versions)?.cv_structured
      const base = hasCvContent(fromCache) ? fromCache : cv
      return cvApi.saveMaster(token, mut(structuredClone(base)))
    },
    onSuccess: invalidateCV,
  })

  function applyRewrite({ fix, oldText, newText }: { fix: V2Fix | null; oldText: string; newText: string }) {
    rewriteApply.mutate({ oldText, newText }, {
      onSuccess: () => {
        if (!fix) return
        setAppliedFixes(p => p.some(a => a.id === fix.id) ? p
          : [...p, { id: fix.id, iid: fix.iid, kind: fix.kind, title: fix.title, gain: fix.gain }])
      },
    })
  }

  function confirmApply() {
    if (!applyHref) return
    capture.open()
    setApplyOpen(false)
  }

  async function recordSubmittedCv() {
    // Only the user's explicit "Yes" freezes a submission artifact. Opening an
    // external page is an attempt, never proof that this CV was submitted.
    await cvApi.applySnapshot(token, {
      job_id: jobId,
      cv_snapshot: {
        text: m.visibleText, title: m.jobTitle, company: m.company, score: m.ready,
        bullets: m.visibleCount, words: m.wordCount,
        structured: cv, hidden: Array.from(hiddenItems),
      },
      cv_version_id: selectedVersion?.id ?? null,
      applied_url: applyHref,
    }).catch(() => {})
    cvApi.versions.promoteMaster(token, Array.from(hiddenItems))
      .then(() => queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) }))
      .catch(() => {})
  }

  // WYSIWYG download in place (ADR-0020): serialize the SAME visible PdfPage and
  // let server Chromium render it, so the sheet the user sees is the artifact.
  async function downloadInPlace(template: CVTemplate = pendingTemplateRef.current) {
    if (pdfBusy) return
    const sheet = sheetWrapRef.current?.querySelector<HTMLElement>(".cvb-pdf-page")
    if (!sheet) { printCvPage(pdfFilename); return }
    const el = template === sheet.getAttribute("data-cv-template")
      ? sheet
      : (() => {
          const clone = sheet.cloneNode(true) as HTMLElement
          clone.setAttribute("data-cv-template", template)
          return clone
        })()
    setPdfBusy(true)
    try {
      await exportSheetPdf(token, el, pdfFilename)
      try { localStorage.setItem("myro-cv-template-v1", template) } catch { /* storage blocked */ }
    } catch {
      printCvPage(pdfFilename)
    } finally {
      setPdfBusy(false)
    }
  }

  function requestDownload(template?: CVTemplate) {
    pendingTemplateRef.current = template ?? readTemplatePref()
    if (m.pageFill.fits) void downloadInPlace(pendingTemplateRef.current)
    else setExportConfirm(true)
  }

  const editableJobMeta = jobId.startsWith("ext_")
  const saveJobMeta = useMutation({
    mutationFn: (v: { title: string; company: string }) => jobsApi.updateImportedDetails(token, jobId, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.jobPath(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.skillGap(jobId) })
      queryClient.invalidateQueries({ queryKey: ["jd-coverage", jobId] })
    },
  })

  const gapCount = coverageQuery.data
    ? coverageQuery.data.weak + coverageQuery.data.gap
    : null

  const header = (
    <>
      <PlaygroundHeader
        jobTitle={m.jobTitle}
        company={m.company}
        reqCount={m.reqCount}
        ready={m.ready}
        delta={sessionRaised}
        scoreCaption={!m.hasSemantic && coverageQuery.isLoading ? "/100 · Match…" : undefined}
        canApply
        primaryLabel={pdfBusy ? "Preparing…" : "Download CV"}
        applyHint={m.pageFill.fits ? "Download this CV" : `Spills onto ${m.pageFill.pages} pages`}
        secondaryLabel="Apply"
        onSecondary={() => setApplyOpen(true)}
        secondaryDisabled={!applyHref}
        secondaryHint={applyHref ? `Open ${m.company} careers` : "No application link yet"}
        saveState={autosaving ? "Saving…" : autosaved ? "Saved" : ""}
        onBack={onBackToBaseline}
        onReqPill={() => setRailRequest(p => ({ tab: "skills", n: (p?.n ?? 0) + 1 }))}
        onApply={() => requestDownload()}
        onDownload={requestDownload}
        onJobLine={m.jdText ? () => setJdOpen(true) : undefined}
        onSaveJobMeta={editableJobMeta ? (async v => { await saveJobMeta.mutateAsync(v) }) : undefined}
      />
      <ApplyCapturePrompt capture={capture} />
      {externalError && <div className="cvb-pgc-err" role="alert">{externalError}</div>}
    </>
  )

  return (
    <>
      <WorkstationShell
        header={header}
        railLabel="Fixes and job fit"
        requestRailTab={railRequest}
        cv={cv}
        identity={identityLines(cv, profile)}
        hidden={hiddenItems}
        targeted
        atsChecks={atsChecks}
        pageFill={m.pageFill}
        lineCount={m.visibleCount}
        wordCount={m.wordCount}
        diagnosis={diagnosis}
        onDismissFix={f => dismiss(f.id)}
        applying={rewriteApply.isPending}
        makeFetcher={(bullet, fix) =>
          rewriteFetcher.authed(token, bullet, { role: m.jobTitle, fix, quantifyOnly: fix?.kind === "Quantify" })}
        onApplyRewrite={applyRewrite}
        onEditLine={(oldText, newText) => rewriteApply.mutate({ oldText, newText })}
        onToggleHidden={toggleItem}
        userSkills={userSkillsQuery.data}
        onPatch={mut => patchMaster.mutate(mut)}
        onAddBullet={(roleIndex, text) => patchMaster.mutate(d => {
          const ri = d.experience[roleIndex] ? roleIndex : d.experience.length - 1
          if (ri >= 0) d.experience[ri].bullets.push(text)
          return d
        })}
        skillsLabel={gapCount == null ? "Skills" : `Skills · ${gapCount} gaps`}
        skillsPane={
          <CoveragePanel
            coverage={coverageQuery.data}
            loading={coverageQuery.isLoading}
            error={coverageQuery.isError}
            onOpenWeave={() => setWeaveOpen(true)}
            onRetry={() => void coverageQuery.refetch()}
          />
        }
        railFooter={
          <button type="button" className="cvw-railfoot-btn" onClick={() => setWeaveOpen(true)}>
            <Icon name="sparkle" size={13} /> Tailor with Mentor
            <span className="cvw-railfoot-cost">50</span>
          </button>
        }
        sheet={
          <div className="cvb-scope">
            <PdfPage
              cv={cv}
              hidden={hiddenItems}
              contact={pdfContact}
              company={m.company !== "Untitled company" ? m.company : undefined}
              footerMarkHidden={selectedVersion?.footer_mark_hidden ?? false}
            />
          </div>
        }
      />

      {exportConfirm && (
        <TrimConfirm
          cv={cv}
          hiddenItems={hiddenItems}
          pageFill={m.pageFill}
          toggleItem={toggleItem}
          onDownload={() => void downloadInPlace()}
          onClose={() => setExportConfirm(false)}
        />
      )}

      <DetailDrawer
        open={jdOpen}
        onClose={() => setJdOpen(false)}
        ariaLabel="Job description"
        header={<DetailHeader title={m.jobTitle} company={m.company} onClose={() => setJdOpen(false)} />}
      >
        <div className="cvb-pgc-jd-drawer-body">{m.jdText}</div>
      </DetailDrawer>

      {weaveOpen && (
        <TailorWeave
          token={token}
          jobId={jobId}
          company={m.company}
          jobTitle={m.jobTitle}
          loomRoles={cv.experience.map(e => e.company || e.role).filter(Boolean)}
          onApplied={versionId => {
            playground.selectVersion(versionId)
            queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
            queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
          }}
          onClose={() => setWeaveOpen(false)}
        />
      )}

      {applyOpen && (
        <ApplyModal
          cv={cv}
          hidden={hiddenItems}
          contact={m.sheetContact}
          company={m.company}
          jobTitle={m.jobTitle}
          ready={m.ready}
          delta={sessionRaised}
          pendingFixes={diagnosis.fixes.length}
          onConfirm={confirmApply}
          onClose={() => setApplyOpen(false)}
          onBackToFixes={() => setApplyOpen(false)}
          onDownload={requestDownload}
        />
      )}

      {/* Hidden canonical artifact: the SAME PdfPage the SHEET tab renders,
          serialized for the server Chromium render, mirroring the live
          projection so the download is exactly what was on screen. */}
      <div ref={sheetWrapRef} hidden aria-hidden="true">
        <PdfPage
          cv={cv}
          hidden={hiddenItems}
          contact={pdfContact}
          company={m.company !== "Untitled company" ? m.company : undefined}
          footerMarkHidden={selectedVersion?.footer_mark_hidden ?? false}
        />
      </div>
    </>
  )
}
