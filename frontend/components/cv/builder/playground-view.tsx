/**
 * PlaygroundView — per-job CV tailoring surface (v2, "CV Playground v2" handoff).
 *
 * Layout: sticky header (job + live count-up score + Apply) · left = the CV
 * pane, toggling between the editor (bullet cards, inline skill chips, fix
 * pills) and the full-width WYSIWYG sheet (Preview) · right = tabbed rail
 * (Fixes / Skills — Preview stays out of the rail, it needs the editor's
 * width to read as an actual CV, not a squeezed sidebar). Mobile swaps the
 * split for a bottom segmented nav (Edit / Fixes / Skills / Preview), with
 * Edit/Preview sharing the editor pane and Fixes/Skills sharing the rail.
 *
 * Three job-context affordances, three destinations: the header requirements
 * pill → Skills tab; the toolbar Job Description button → the raw JD drawer;
 * the rail Skills tab button → Skills tab. Fix cards lazy-load the Mentor
 * pick-a-version rewrite in place; Ready recomputes deterministically so a
 * promised +N is a delivered +N. Read model lives in usePlaygroundModel;
 * projection persistence stays in useCVPlayground.
 */
"use client"

import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CVStructured, JobMatchesResponse, UserProfile } from "@/lib/api"
import { jobs as jobsApi, cv as cvApi } from "@/lib/api"
import { CVEditor } from "./cv-editor"
import { ExperienceIntake } from "./experience-intake"
import { PlaygroundRail } from "./playground-rail"
import { PreviewRail } from "./preview-rail"
import { PlaygroundBottomNav } from "./playground-bottomnav"
import { ApplyModal } from "./apply-modal"
import { TrimConfirm } from "./trim-confirm"
import { PlaygroundHeader } from "./playground-header"
import { PdfPage, type PdfPageContact } from "./pdf-page"
import { exportSheetPdf } from "@/lib/cv/sheet-pdf"
import { printCvPage } from "@/lib/cv/print-cv"
import { DEFAULT_TEMPLATE, isCVTemplate, type CVTemplate } from "@/lib/cv/templates"
import { usePlaygroundModel } from "./use-playground-model"
import { useDismissedFixes } from "./use-dismissed-fixes"
import type { AppliedFix, V2Fix } from "./fix-model"
import { dataKeys } from "@/lib/domain-data"
import type { CVPlaygroundState } from "@/lib/hooks/use-cv-playground"
import { DetailDrawer } from "@/components/jobs/detail-drawer"
import { DetailHeader } from "@/components/jobs/detail-header"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { Icon } from "./icons"

type V2Tab = "edit" | "fixes" | "skills" | "preview"

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
}

export function PlaygroundView({
  token, jobId, playground, cv, profile,
  onBackToBaseline, externalError,
}: PlaygroundViewProps) {
  const { selectedVersion, hiddenItems, toggleItem, autosaving, autosaved } = playground
  const [tab, setTab] = useState<V2Tab>("edit")
  const [expandedFixId, setExpandedFixId] = useState<string | null>(null)
  const [appliedFixes, setAppliedFixes] = useState<AppliedFix[]>([])
  const [flash, setFlash] = useState<{ iid: string; n: number } | null>(null)
  const [intakeSeed, setIntakeSeed] = useState<string | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [jdOpen, setJdOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [appliedDone, setAppliedDone] = useState(false)
  const [submittingApply, setSubmittingApply] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const sheetWrapRef = useRef<HTMLDivElement>(null)
  // Chosen print-CSS template for the download. Shared localStorage key with the
  // master export surface so the pick is consistent across both. A trim-gated
  // download stashes the picked template here until the user confirms the trim.
  const pendingTemplateRef = useRef<CVTemplate>(DEFAULT_TEMPLATE)
  const queryClient = useQueryClient()
  const railTab: "fixes" | "skills" = tab === "fixes" || tab === "skills" ? tab : "fixes"

  const m = usePlaygroundModel(token, jobId, cv, profile, hiddenItems)
  const { dismissed, dismiss, restore } = useDismissedFixes(`job:${jobId}`)

  // Full PdfPageContact for the canonical artifact (the model's sheetContact is
  // the compact V2Sheet shape; the exported sheet needs the full contact line).
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

  // The rail/editor/counters read the non-dismissed list; dismissed-but-still-
  // open fixes render in the rail's collapsed Dismissed group (their penalty
  // stays in Ready — dismissing never buys points).
  const visibleFixes = useMemo(
    () => m.openFixes.filter(f => !dismissed.has(f.id)),
    [m.openFixes, dismissed],
  )
  const dismissedFixes = useMemo(
    () => m.openFixes.filter(f => dismissed.has(f.id)),
    [m.openFixes, dismissed],
  )

  // The job's Worth-it verdict (the prize axis, beside the header's Ready score).
  // Passive read of the matches cache — never fetches; absent when the user
  // reached tailoring without a cached match → the chip simply hides (no fabrication).
  const { data: matchesCache } = useQuery<JobMatchesResponse>({ queryKey: dataKeys.jobs(), enabled: false })
  const worthIt = useMemo(() => {
    const match = matchesCache?.jobs?.find((j) => j.job_id === jobId)
    return match && match.match_score > 0 ? { verdict: match.verdict, score: match.match_score } : undefined
  }, [matchesCache, jobId])

  const sourceUrl = m.application?.source_url?.trim() ?? ""
  const capture = useApplyCapture({
    token,
    job: { job_id: jobId, source_url: sourceUrl || null, company: m.company !== "Untitled company" ? m.company : null },
    surface: "other",
  })
  const applyHref = capture.href ?? ""
  const isApplied = m.application?.status != null && m.application.status !== "saved"

  const openFixIds = useMemo(() => new Set(m.openFixes.map(f => f.id)), [m.openFixes])
  const appliedShown = appliedFixes.filter(a => !openFixIds.has(a.id))

  function invalidateCV() {
    queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
    queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
    queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
    queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
    queryClient.invalidateQueries({ queryKey: ["cv-gap-plan", jobId] })
  }

  const rewriteApply = useMutation({
    mutationFn: ({ oldText, newText }: { oldText: string; newText: string }) =>
      cvApi.rewriteApply(token, { old_text: oldText, new_text: newText }),
    onSuccess: invalidateCV,
  })

  // "Add from your experience": insert a Mentor-drafted bullet into the living
  // master under the best-fit role. Reads the freshest structured from cache so
  // rapid adds don't stack on a stale base.
  const addBullet = useMutation({
    mutationFn: ({ roleIndex, text }: { roleIndex: number | null; text: string }) => {
      const base = (queryClient.getQueryData(dataKeys.cvStructured()) as CVStructured | undefined) ?? cv
      const next: CVStructured = JSON.parse(JSON.stringify(base))
      const ri = roleIndex != null && next.experience[roleIndex] ? roleIndex : next.experience.length - 1
      if (ri < 0) return Promise.reject(new Error("Add a role to your CV first."))
      next.experience[ri].bullets.push(text)
      return cvApi.saveMaster(token, next)
    },
    onSuccess: invalidateCV,
  })

  const markApplied = useMutation({
    mutationFn: () => jobsApi.updateApplication(token, jobId, { status: "applied" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.applications() }),
  })

  function jumpTo(iid: string) {
    setFlash(prev => ({ iid, n: (prev?.n ?? 0) + 1 }))
  }
  function openFixCard(fix: V2Fix) {
    restore(fix.id) // a Skills-tab "Fix it" on a dismissed fix is explicit intent — bring the card back
    setTab("fixes")
    setExpandedFixId(fix.id)
    jumpTo(fix.iid)
  }
  function dismissFix(fix: V2Fix) {
    if (expandedFixId === fix.id) setExpandedFixId(null)
    dismiss(fix.id, openFixIds)
  }
  function openIntake(seed?: string) {
    setIntakeSeed(seed ?? null)
    setIntakeOpen(true)
  }
  function applyFixRewrite(fix: V2Fix, oldText: string, newText: string) {
    rewriteApply.mutate({ oldText, newText }, {
      onSuccess: () => {
        setAppliedFixes(p => p.some(a => a.id === fix.id) ? p
          : [...p, { id: fix.id, iid: fix.iid, kind: fix.kind, title: fix.title, gain: fix.gain }])
        setExpandedFixId(null)
      },
    })
  }

  async function confirmApply() {
    if (submittingApply || !applyHref) return
    setSubmittingApply(true)
    try {
      // Freeze the exact CV submitted against this job (CVJT1 immutable attempt).
      await cvApi.applySnapshot(token, {
        job_id: jobId,
        cv_snapshot: {
          text: m.visibleText, title: m.jobTitle, company: m.company, score: m.ready,
          bullets: m.visibleCount, words: m.wordCount,
        },
        cv_version_id: selectedVersion?.id ?? null,
        applied_url: applyHref,
      }).catch(() => {})   // never block the application on the snapshot write
      capture.onApply()
      if (!isApplied) markApplied.mutate()
      window.open(applyHref, "_blank", "noopener,noreferrer")
      setAppliedDone(true)
    } finally {
      setSubmittingApply(false)
    }
  }
  // WYSIWYG download in place (ADR-0020): render the canonical PdfPage sheet
  // from the LIVE projection (cv + hiddenItems) in a hidden mount, serialize
  // its DOM, and let server Chromium render it. No navigation → the exact sheet
  // the user sees is the artifact, and deselected lines can never resurrect
  // through a re-hydrating export page.
  async function downloadInPlace(template: CVTemplate = pendingTemplateRef.current) {
    if (pdfBusy) return
    const sheet = sheetWrapRef.current?.querySelector<HTMLElement>(".cvb-pdf-page")
    if (!sheet) { printCvPage(pdfFilename); return }
    // The template is pure CSS keyed off `data-cv-template` on the sheet root;
    // clone the previewed DOM and stamp the chosen variant so the server render
    // picks it up — no React re-render, no race with the hidden mount.
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
      // Server renderer down (503 / network) → native browser print of the same
      // visible sheet is the WYSIWYG fallback, so a real PDF always lands.
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

  const gapSkillNames = useMemo(() => {
    const missing = m.evaluatedTargets.filter(t => !t.matched).map(t => t.kw)
    if (!intakeSeed) return missing
    return [intakeSeed, ...missing.filter(s => s.toLowerCase() !== intakeSeed.toLowerCase())]
  }, [m.evaluatedTargets, intakeSeed])

  const saveState = autosaving ? "Saving…" : autosaved ? "Saved" : ""
  const fixCountLabel = visibleFixes.length > 0 ? String(visibleFixes.length) : "✓"

  return (
    <div className="cvb-v2" data-tab={tab}>
      <PlaygroundHeader
        jobTitle={m.jobTitle}
        company={m.company}
        reqCount={m.allTargets.length}
        ready={m.ready}
        delta={m.delta}
        worthIt={worthIt}
        canApply={!!applyHref}
        applyHint={applyHref ? `Open ${m.company} careers` : "No application link yet"}
        saveState={saveState}
        onBack={onBackToBaseline}
        onReqPill={() => setTab("skills")}
        onApply={() => { setAppliedDone(false); setApplyOpen(true) }}
        onDownload={requestDownload}
      />
      <ApplyCapturePrompt capture={capture} />
      {externalError && <div className="cvb-pgc-err" role="alert">{externalError}</div>}

      <div className="cvb-v2-main">
        <section className="cvb-v2-editor" aria-label="Your CV">
          <div className="cvb-v2-toolbar">
            <button
              type="button"
              className={`cvb-v2-tabbtn wide${tab === "preview" ? " active" : ""}`}
              onClick={() => setTab(tab === "preview" ? "edit" : "preview")}
            >Preview</button>
            <span className="cvb-v2-toolbar-label mono">Your CV</span>
            <span className="cvb-v2-headspacer" aria-hidden />
            {m.jdText && (
              <button type="button" className="cvb-v2-ghostbtn" onClick={() => setJdOpen(true)}>
                Job Description
              </button>
            )}
            <button type="button" className="cvb-v2-intakebtn" onClick={() => openIntake()}>
              <Icon name="sparkle" size={13} /> Add from your experience
            </button>
          </div>
          <div className="cvb-v2-editorbody">
            {tab === "preview" ? (
              <PreviewRail
                cv={cv}
                hidden={hiddenItems}
                contact={m.sheetContact}
                baseScore={m.baseScore}
                ready={m.ready}
                delta={m.delta}
                company={m.company}
                pageFill={m.pageFill}
                onDownload={requestDownload}
                onApply={() => { setAppliedDone(false); setApplyOpen(true) }}
                canApply={!!applyHref}
              />
            ) : (
              <CVEditor
                token={token}
                cv={cv}
                profile={profile}
                hiddenItems={hiddenItems}
                toggleItem={toggleItem}
                targets={m.evaluatedTargets}
                missingKeywords={m.evaluatedTargets.filter(t => !t.matched).map(t => t.kw)}
                applying={rewriteApply.isPending}
                onApply={(oldText, newText) => rewriteApply.mutate({ oldText, newText })}
                onAddBullet={(roleIndex, text) => addBullet.mutate({ roleIndex, text })}
                addingBullet={addBullet.isPending}
                visibleCount={m.visibleCount}
                wordCount={m.wordCount}
                rewriteTarget={null}
                onClearRewriteTarget={() => {}}
                fixes={visibleFixes}
                applied={appliedShown}
                onFixPill={openFixCard}
                dismissedFixIds={dismissed}
                flash={flash}
              />
            )}
          </div>
        </section>

        <PlaygroundRail
          token={token}
          tab={railTab}
          model={m}
          fixes={visibleFixes}
          dismissedFixes={dismissedFixes}
          applied={appliedShown}
          expandedId={expandedFixId}
          applying={rewriteApply.isPending}
          fixCountLabel={fixCountLabel}
          onTab={setTab}
          onGoPreview={() => setTab("preview")}
          onExpand={f => setExpandedFixId(f?.id ?? null)}
          onJump={jumpTo}
          onApplyFix={applyFixRewrite}
          onDismissFix={dismissFix}
          onRestoreFix={f => restore(f.id)}
          onFixCard={openFixCard}
          onOpenIntake={openIntake}
        />
      </div>

      <PlaygroundBottomNav tab={tab} fixCountLabel={fixCountLabel} onTab={setTab} />

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

      {intakeOpen && (
        <ExperienceIntake
          token={token}
          jobId={jobId}
          jdText={m.jdText}
          gapSkills={gapSkillNames}
          roles={m.roles}
          adding={addBullet.isPending}
          onAdd={(roleIndex, text) => addBullet.mutateAsync({ roleIndex, text }).then(() => {})}
          onClose={() => { setIntakeOpen(false); setIntakeSeed(null) }}
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
          delta={m.delta}
          pendingFixes={visibleFixes.length}
          submitting={submittingApply}
          applied={appliedDone}
          onConfirm={() => void confirmApply()}
          onClose={() => { setApplyOpen(false); setAppliedDone(false) }}
          onBackToFixes={() => { setApplyOpen(false); setTab("fixes") }}
          onDownload={requestDownload}
        />
      )}

      {/* Hidden canonical artifact: the SAME PdfPage every export surface renders,
          serialized (outerHTML) for the server Chromium render. Mirrors the live
          projection (cv + hiddenItems) so the download is exactly the preview.
          `hidden` keeps it out of layout and out of print isolation. */}
      <div ref={sheetWrapRef} hidden aria-hidden="true">
        <PdfPage
          cv={cv}
          hidden={hiddenItems}
          contact={pdfContact}
          company={m.company !== "Untitled company" ? m.company : undefined}
          footerMarkHidden={selectedVersion?.footer_mark_hidden ?? false}
        />
      </div>
    </div>
  )
}
