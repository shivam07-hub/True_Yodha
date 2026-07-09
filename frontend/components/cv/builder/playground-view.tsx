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

import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { CVStructured, UserProfile } from "@/lib/api"
import { jobs as jobsApi, cv as cvApi } from "@/lib/api"
import { CVEditor } from "./cv-editor"
import { ExperienceIntake } from "./experience-intake"
import { PlaygroundRail } from "./playground-rail"
import { PreviewRail } from "./preview-rail"
import { PlaygroundBottomNav } from "./playground-bottomnav"
import { ApplyModal } from "./apply-modal"
import { TrimConfirm } from "./trim-confirm"
import { PlaygroundHeader } from "./playground-header"
import { usePlaygroundModel } from "./use-playground-model"
import type { AppliedFix, V2Fix } from "./fix-model"
import { dataKeys } from "@/lib/domain-data"
import type { CVPlaygroundState } from "@/lib/hooks/use-cv-playground"
import { DetailDrawer } from "@/components/jobs/detail-drawer"
import { DetailHeader } from "@/components/jobs/detail-header"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { Icon } from "./icons"

type V2Tab = "edit" | "fixes" | "skills" | "preview"

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
  onBackToBaseline, onExportPDF, externalError,
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
  const queryClient = useQueryClient()
  const railTab: "fixes" | "skills" = tab === "fixes" || tab === "skills" ? tab : "fixes"

  const m = usePlaygroundModel(token, jobId, cv, profile, hiddenItems)
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
    setTab("fixes")
    setExpandedFixId(fix.id)
    jumpTo(fix.iid)
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
  function requestDownload() {
    if (m.pageFill.fits) onExportPDF(m.ready)
    else setExportConfirm(true)
  }

  const gapSkillNames = useMemo(() => {
    const missing = m.evaluatedTargets.filter(t => !t.matched).map(t => t.kw)
    if (!intakeSeed) return missing
    return [intakeSeed, ...missing.filter(s => s.toLowerCase() !== intakeSeed.toLowerCase())]
  }, [m.evaluatedTargets, intakeSeed])

  const saveState = autosaving ? "Saving…" : autosaved ? "Saved" : ""
  const fixCountLabel = m.openFixes.length > 0 ? String(m.openFixes.length) : "✓"

  return (
    <div className="cvb-v2" data-tab={tab}>
      <PlaygroundHeader
        jobTitle={m.jobTitle}
        company={m.company}
        reqCount={m.allTargets.length}
        ready={m.ready}
        delta={m.delta}
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
                fixes={m.openFixes}
                applied={appliedShown}
                onFixPill={openFixCard}
                flash={flash}
              />
            )}
          </div>
        </section>

        <PlaygroundRail
          token={token}
          tab={railTab}
          model={m}
          applied={appliedShown}
          expandedId={expandedFixId}
          applying={rewriteApply.isPending}
          fixCountLabel={fixCountLabel}
          onTab={setTab}
          onGoPreview={() => setTab("preview")}
          onExpand={f => setExpandedFixId(f?.id ?? null)}
          onJump={jumpTo}
          onApplyFix={applyFixRewrite}
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
          onDownload={() => onExportPDF(m.ready)}
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
          pendingFixes={m.openFixes.length}
          submitting={submittingApply}
          applied={appliedDone}
          onConfirm={() => void confirmApply()}
          onClose={() => { setApplyOpen(false); setAppliedDone(false) }}
          onBackToFixes={() => { setApplyOpen(false); setTab("fixes") }}
          onDownload={requestDownload}
        />
      )}
    </div>
  )
}
