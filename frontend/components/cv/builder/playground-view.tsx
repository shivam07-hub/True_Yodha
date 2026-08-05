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

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { CVStructured, UserProfile } from "@/lib/api"
import { cv as cvApi, jobs as jobsApi } from "@/lib/api"
import { CVEditor } from "./cv-editor"
import type { MergePayload } from "./bullet-merge"
import { ExperienceIntake } from "./experience-intake"
import { TailorWeave } from "./tailor-weave"
import { PlaygroundRail } from "./playground-rail"
import "./tailor-weave.css"
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
import { dataKeys, invalidateScoreMapData } from "@/lib/domain-data"
import type { CVPlaygroundState } from "@/lib/hooks/use-cv-playground"
import { DetailDrawer } from "@/components/jobs/detail-drawer"
import { DetailHeader } from "@/components/jobs/detail-header"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { similarRolesHref } from "@/lib/jobs/similar-roles"
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
  /** Practice handoff opens the existing deep, evidence-grounded Mentor weave. */
  mentorRequested?: boolean
}

export function PlaygroundView({
  token, jobId, playground, cv, profile,
  onBackToBaseline, externalError, mentorRequested = false,
}: PlaygroundViewProps) {
  const { selectedVersion, hiddenItems, toggleItem, autosaving, autosaved } = playground
  const router = useRouter()
  const [tab, setTab] = useState<V2Tab>("edit")
  const [expandedFixId, setExpandedFixId] = useState<string | null>(null)
  const [appliedFixes, setAppliedFixes] = useState<AppliedFix[]>([])
  const [flash, setFlash] = useState<{ iid: string; n: number } | null>(null)
  const [intakeSeed, setIntakeSeed] = useState<string | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [weaveOpen, setWeaveOpen] = useState(mentorRequested)
  const [jdOpen, setJdOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const sheetWrapRef = useRef<HTMLDivElement>(null)
  // Chosen print-CSS template for the download. Shared localStorage key with the
  // master export surface so the pick is consistent across both. A trim-gated
  // download stashes the picked template here until the user confirms the trim.
  const pendingTemplateRef = useRef<CVTemplate>(DEFAULT_TEMPLATE)
  const queryClient = useQueryClient()
  const railTab: "fixes" | "skills" = tab === "fixes" || tab === "skills" ? tab : "fixes"

  useEffect(() => {
    if (mentorRequested) setWeaveOpen(true)
  }, [mentorRequested])

  const m = usePlaygroundModel(token, jobId, cv, profile, hiddenItems)
  const { dismissed, dismiss, restore } = useDismissedFixes(`job:${jobId}`)

  // Lane C — "What this job wants": the JD's real requirements classified against
  // the user's career stories + CV lines (covered / partial / missing). Owned by
  // the model (it's the semantic 70% of the Match score); the rail map reads it,
  // and Tailor with Mentor grounds its interview on the same panel server-side.
  const coverageQuery = m.coverageQuery

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

  const sourceUrl = m.application?.source_url?.trim() ?? ""
  const capture = useApplyCapture({
    token,
    job: { job_id: jobId, source_url: sourceUrl || null, company: m.company !== "Untitled company" ? m.company : null },
    surface: "other",
    intentSurface: "cv_playground",
    onSubmitted: recordSubmittedCv,
    // The guard state ("this listing is closed") offers live alternatives, and
    // on this surface that button used to call nothing — no onFindSimilar was
    // ever passed. Terminal states hand off through the Next chip instead.
    onFindSimilar: () => router.push(similarRolesHref(m.application?.role_domain)),
  })
  const applyHref = capture.href ?? ""

  const openFixIds = useMemo(() => new Set(m.openFixes.map(f => f.id)), [m.openFixes])
  const appliedShown = appliedFixes.filter(a => !openFixIds.has(a.id))
  // "▲ +N raised" = points actually landed this session (each applied fix's
  // deterministic gain) — not a diff of two differently-scaled scores.
  const sessionRaised = appliedShown.reduce((s, a) => s + a.gain, 0)

  function invalidateCV() {
    queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
    queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
    invalidateScoreMapData(queryClient)
    queryClient.invalidateQueries({ queryKey: ["cv-gap-plan", jobId] })
  }

  const rewriteApply = useMutation({
    mutationFn: ({ oldText, newText }: { oldText: string; newText: string }) =>
      cvApi.rewriteApply(token, { old_text: oldText, new_text: newText }),
    onSuccess: invalidateCV,
  })

  const mergeApply = useMutation({
    mutationFn: (p: MergePayload) => cvApi.mergeBulletApply(token, {
      old_text_a: p.oldTextA, old_text_b: p.oldTextB, merged_text: p.mergedText,
      section_hint: p.section, item_index: p.itemIndex,
      bullet_index_a: p.bulletIndexA, bullet_index_b: p.bulletIndexB,
    }),
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
      .then(() => {
        queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
        queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      })
      .catch(() => {})
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

  // "Add from your experience" seeds off the JD's real GAP requirements
  // (jd_coverage), never taxonomy keywords.
  const gapSkillNames = useMemo(() => {
    const gaps = m.gapRequirements
    if (!intakeSeed) return gaps
    return [intakeSeed, ...gaps.filter(s => s.toLowerCase() !== intakeSeed.toLowerCase())]
  }, [m.gapRequirements, intakeSeed])

  const saveState = autosaving ? "Saving…" : autosaved ? "Saved" : ""
  const fixCountLabel = visibleFixes.length > 0 ? String(visibleFixes.length) : "✓"

  // Only extension imports (ext_ ids) carry a user-editable role/company — a
  // scraped job's fields are scraper-owned. Correcting it re-reads the header.
  const editableJobMeta = jobId.startsWith("ext_")
  const saveJobMeta = useMutation({
    mutationFn: (v: { title: string; company: string }) => jobsApi.updateImportedDetails(token, jobId, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.jobPath(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.skillGap(jobId) })
      queryClient.invalidateQueries({ queryKey: ["jd-coverage", jobId] })
    },
  })

  return (
    <div className="cvb-v2" data-tab={tab}>
      <PlaygroundHeader
        jobTitle={m.jobTitle}
        company={m.company}
        reqCount={m.reqCount}
        ready={m.ready}
        delta={sessionRaised}
        scoreCaption={!m.hasSemantic && coverageQuery.isLoading ? "/100 · Match…" : undefined}
        canApply={!!applyHref}
        applyHint={applyHref ? `Open ${m.company} careers` : "No application link yet"}
        saveState={saveState}
        onBack={onBackToBaseline}
        onReqPill={() => setTab("skills")}
        onApply={() => setApplyOpen(true)}
        onDownload={requestDownload}
        onSaveJobMeta={editableJobMeta ? (async v => { await saveJobMeta.mutateAsync(v) }) : undefined}
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
            <button type="button" className="tw-cta" onClick={() => setWeaveOpen(true)}>
              <Icon name="sparkle" size={13} /> Tailor with Mentor
              <span className="tw-cta-cost">50</span>
            </button>
          </div>
          <div className="cvb-v2-editorbody">
            {tab === "preview" ? (
              <PreviewRail
                cv={cv}
                hidden={hiddenItems}
                contact={m.sheetContact}
                baseScore={Math.max(0, m.ready - sessionRaised)}
                ready={m.ready}
                delta={sessionRaised}
                company={m.company}
                pageFill={m.pageFill}
                onDownload={requestDownload}
                onApply={() => setApplyOpen(true)}
                canApply={!!applyHref}
              />
            ) : (
              <CVEditor
                token={token}
                cv={cv}
                profile={profile}
                hiddenItems={hiddenItems}
                toggleItem={toggleItem}
                targets={[]}
                missingKeywords={[]}
                applying={rewriteApply.isPending}
                onApply={(oldText, newText) => rewriteApply.mutate({ oldText, newText })}
                onMergeApply={(payload: MergePayload) => mergeApply.mutate(payload)}
                mergeApplying={mergeApply.isPending}
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
          fixes={visibleFixes}
          dismissedFixes={dismissedFixes}
          applied={appliedShown}
          expandedId={expandedFixId}
          applying={rewriteApply.isPending}
          fixCountLabel={fixCountLabel}
          coverage={coverageQuery.data}
          coverageLoading={coverageQuery.isLoading}
          coverageError={coverageQuery.isError}
          onTab={setTab}
          onGoPreview={() => setTab("preview")}
          onExpand={f => setExpandedFixId(f?.id ?? null)}
          onJump={jumpTo}
          onApplyFix={applyFixRewrite}
          onDismissFix={dismissFix}
          onRestoreFix={f => restore(f.id)}
          onOpenIntake={openIntake}
          onOpenWeave={() => setWeaveOpen(true)}
          onRetryCoverage={() => void coverageQuery.refetch()}
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

      {weaveOpen && (
        <TailorWeave
          token={token}
          jobId={jobId}
          company={m.company}
          jobTitle={m.jobTitle}
          loomRoles={cv.experience.map(e => e.company || e.role).filter(Boolean)}
          onApplied={versionId => {
            // The tailored version is the artifact (L3): select it so the
            // playground edits AGAINST it, and refresh the version ledger.
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
          pendingFixes={visibleFixes.length}
          onConfirm={confirmApply}
          onClose={() => setApplyOpen(false)}
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
