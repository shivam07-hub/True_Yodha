/**
 * PlaygroundView — per-job CV tailoring surface (Option C, hierarchy redesign).
 *
 * Layout (design: CV Playground - Option C):
 *   [crumb · role title · Ready/100 · Apply →]   readiness bar
 *   [ Raise it rail (gaps) | the CV, now the editor ]
 *
 * One Ready number leads; the gaps are an inline worklist (no modal); the CV is
 * the editor (per-line Copy / Rewrite / Edit / Hide). Edits auto-save (no Save
 * button) — useCVPlayground owns the projection persistence. Restructure +
 * Download live in a small overflow so the header stays a single Apply CTA.
 * State machine lives in useCVPlayground — this is a thin shell.
 */
"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CVStructured,
  GapPlanResponse,
  JobPathResponse,
  SkillGapResponse,
  UserProfile,
} from "@/lib/api"
import { jobs as jobsApi, cv as cvApi } from "@/lib/api"
import { RestructureProposal } from "./restructure-proposal"
import { RaiseItRail } from "./raise-it-rail"
import { CVEditor, type RewriteTarget } from "./cv-editor"
import { ExperienceIntake } from "./experience-intake"
import { itemId } from "@/lib/cv-compose"
import { dataKeys } from "@/lib/domain-data"
import type { CVPlaygroundState } from "@/lib/hooks/use-cv-playground"
import { Icon } from "./icons"
import { useDeadLinkPrompt } from "@/components/jobs/use-dead-link-prompt"
import {
  resolvePlaygroundCompany,
  targetsFromSkillGap,
  type KeywordTarget,
} from "./keyword-utils"
import { IDEAL_CV_SPEC, estimateLines, pageFillFromLines, type PageFill } from "@/lib/cv/page-fill"

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
  const { selectedVersion, selectVersion, hiddenItems, toggleItem, autosaving, autosaved } = playground
  const [restructureOpen, setRestructureOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(false)
  const [rewriteTarget, setRewriteTarget] = useState<RewriteTarget | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const queryClient = useQueryClient()
  const dead = useDeadLinkPrompt({ token, jobId, surface: "other" })

  const rewriteApply = useMutation({
    mutationFn: ({ oldText, newText }: { oldText: string; newText: string }) =>
      cvApi.rewriteApply(token, { old_text: oldText, new_text: newText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
      queryClient.invalidateQueries({ queryKey: ["cv-gap-plan", jobId] })
    },
  })

  // "Add from your experience": insert a Mentor-drafted bullet into the living
  // master under the best-fit role (cheap autosave, no charge). Reads the freshest
  // structured from cache so rapid adds don't stack on a stale base.
  const addBullet = useMutation({
    mutationFn: ({ roleIndex, text }: { roleIndex: number | null; text: string }) => {
      const base = (queryClient.getQueryData(dataKeys.cvStructured()) as CVStructured | undefined) ?? cv
      const next: CVStructured = JSON.parse(JSON.stringify(base))
      const ri = roleIndex != null && next.experience[roleIndex]
        ? roleIndex
        : next.experience.length - 1
      if (ri < 0) return Promise.reject(new Error("Add a role to your CV first."))
      next.experience[ri].bullets.push(text)
      return cvApi.saveMaster(token, next)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
      queryClient.invalidateQueries({ queryKey: ["cv-gap-plan", jobId] })
    },
  })

  const jobPathQuery = useQuery({
    queryKey: dataKeys.jobPath(jobId),
    queryFn: () => jobsApi.path(token, jobId),
    staleTime: 5 * 60 * 1000,
  })
  const skillGapQuery = useQuery({
    queryKey: dataKeys.skillGap(jobId),
    queryFn: () => jobsApi.skillGap(token, jobId),
    staleTime: 5 * 60 * 1000,
  })
  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    staleTime: 60_000,
  })
  const gapPlanQuery = useQuery<GapPlanResponse>({
    queryKey: ["cv-gap-plan", jobId],
    queryFn: () => cvApi.gapPlan(token, jobId),
    staleTime: 60_000,
  })

  const job: Partial<JobPathResponse> = jobPathQuery.data ?? {}
  const gap: Partial<SkillGapResponse> = skillGapQuery.data ?? {}
  const application = applicationsQuery.data?.find(a => a.job_id === jobId) ?? null
  const company = resolvePlaygroundCompany(job.company, gap.company)
  const jobTitle = job.job_title ?? gap.job_title ?? "Untitled role"
  const sourceUrl = application?.source_url?.trim() ?? ""
  const applyHref = sourceUrl || (company !== "Untitled company" ? `https://www.google.com/search?q=${encodeURIComponent(`${company} careers`)}` : "")
  const isApplied = application?.status != null && application.status !== "saved"
  const jdText = (application?.job_description ?? "").trim()
  const roles = useMemo(
    () => cv.experience.map((e, i) => ({ index: i, label: `${e.role} · ${e.company}` })),
    [cv.experience],
  )

  const allTargets: KeywordTarget[] = useMemo(() => targetsFromSkillGap(gap.skills ?? []), [gap.skills])

  const visibleText = useMemo(() => {
    const parts: string[] = []
    if (cv.summary && !hiddenItems.has(itemId("summary", 0, cv.summary))) parts.push(cv.summary)
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b))) parts.push(b)
    }))
    cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b))) parts.push(b)
    }))
    if (cv.skills_line && !hiddenItems.has(itemId("skills_line", 0, cv.skills_line))) parts.push(cv.skills_line)
    return parts.join(" ")
  }, [hiddenItems, cv])

  const evaluatedTargets = useMemo<KeywordTarget[]>(() => {
    const lower = visibleText.toLowerCase()
    return allTargets.map(t => ({ ...t, matched: lower.includes(t.kw.toLowerCase()) }))
  }, [allTargets, visibleText])

  const baseScore = job.readiness_pct ?? 0
  const ready = useMemo(() => {
    if (evaluatedTargets.length === 0) return baseScore
    const total = evaluatedTargets.reduce((s, t) => s + (t.weight ?? 1), 0)
    const got = evaluatedTargets.filter(t => t.matched).reduce((s, t) => s + (t.weight ?? 1), 0)
    return total === 0 ? 0 : Math.round((got / total) * 100)
  }, [evaluatedTargets, baseScore])
  const delta = ready - baseScore

  const totalWeight = useMemo(
    () => Math.max(1, evaluatedTargets.reduce((s, t) => s + (t.weight ?? 1), 0)),
    [evaluatedTargets],
  )
  // Deterministic readiness gain for a gap's keyword(s): its share of total
  // keyword weight, in score points (matches the Ready math above). Off-list gaps
  // get a nominal +1 rather than a fabricated number.
  const pointsFor = useMemo(() => (keywords: string[]): number => {
    const set = new Set(keywords.map(k => k.toLowerCase()))
    let w = 0
    evaluatedTargets.forEach(t => { if (set.has(t.kw.toLowerCase())) w += (t.weight ?? 1) })
    if (w === 0) w = 1
    return Math.max(1, Math.round((w / totalWeight) * 100))
  }, [evaluatedTargets, totalWeight])

  const visibleCount = useMemo(() => {
    let n = 0
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b))) n += 1
    }))
    cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b))) n += 1
    }))
    return n
  }, [hiddenItems, cv])
  const wordCount = useMemo(
    () => visibleText.trim() ? visibleText.trim().split(/\s+/).length : 0,
    [visibleText],
  )

  const pageFill: PageFill = useMemo(() => {
    const cpl = IDEAL_CV_SPEC.charsPerLine
    let lines = 3
    if (cv.summary && !hiddenItems.has(itemId("summary", 0, cv.summary))) lines += 1 + estimateLines(cv.summary, cpl)
    let expVisible = false
    cv.experience.forEach((e, ei) => {
      const kept = e.bullets.filter((b, bi) => !hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b)))
      if (kept.length) { expVisible = true; lines += 1 + kept.reduce((s, b) => s + estimateLines(b, cpl), 0) }
    })
    if (expVisible) lines += 1
    if (cv.skills_line && !hiddenItems.has(itemId("skills_line", 0, cv.skills_line))) lines += 1 + estimateLines(cv.skills_line, cpl)
    return pageFillFromLines(lines)
  }, [cv, hiddenItems])

  const markApplied = useMutation({
    mutationFn: () => jobsApi.updateApplication(token, jobId, { status: "applied" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.applications() }),
  })

  function handleApply() {
    if (!applyHref) return
    dead.markApplied()
    if (!isApplied) markApplied.mutate()
    window.open(applyHref, "_blank", "noopener,noreferrer")
  }
  function requestDownload() {
    setOverflowOpen(false)
    if (pageFill.fits) onExportPDF(ready)
    else setExportConfirm(true)
  }
  function autoTrimToFit() {
    setExportConfirm(false)
    const overflow = Math.max(0, Math.round(pageFill.ratio * IDEAL_CV_SPEC.lineBudget) - IDEAL_CV_SPEC.lineBudget)
    if (overflow <= 0) return
    const cpl = IDEAL_CV_SPEC.charsPerLine
    const cands: { iid: string; lines: number }[] = []
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      const iid = itemId("exp_bullet", ei * 100 + bi, b)
      if (!hiddenItems.has(iid)) cands.push({ iid, lines: estimateLines(b, cpl) })
    }))
    cands.sort((a, b) => b.lines - a.lines)
    let freed = 0
    for (const c of cands) { if (freed >= overflow) break; toggleItem(c.iid); freed += c.lines }
  }

  const saveState = autosaving ? "Saving…" : autosaved ? "Saved" : ""

  return (
    <div className="cvb-pgc">
      <div className="cvb-pgc-top">
        <div className="cvb-pgc-headrow">
          <div className="cvb-pgc-headinfo">
            <button type="button" className="cvb-pgc-crumb" onClick={onBackToBaseline}>
              <Icon name="chevron-right" size={12} style={{ transform: "rotate(180deg)" }}/> Library · {company}
            </button>
            <h1 className="cvb-pgc-title">{jobTitle}</h1>
          </div>
          <div className="cvb-pgc-headside">
            <div className="cvb-pgc-ready">
              <div className="cvb-pgc-ready-num">
                <span className="tabnum mono">{ready}</span><span className="cvb-pgc-ready-100 mono">/100</span>
              </div>
              <div className="cvb-pgc-ready-cap">
                <span className="mono">Ready</span>
                <span className="mono cvb-pgc-ready-delta">{delta > 0 ? `▲ ${delta}` : "build it up"}</span>
              </div>
            </div>
            <button
              type="button"
              className="cvb-pgc-apply"
              onClick={handleApply}
              disabled={!applyHref}
              title={applyHref ? `Open ${company} careers` : "No application link yet"}
            >Apply →</button>
            <div className="cvb-pgc-overflow">
              <button
                type="button"
                className="cvb-pgc-overflow-btn"
                onClick={() => setOverflowOpen(o => !o)}
                aria-label="More actions"
                aria-expanded={overflowOpen}
              >⋯</button>
              {overflowOpen && (
                <div className="cvb-pgc-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); setRestructureOpen(true) }}>
                    <Icon name="sparkle" size={13}/> Restructure with Mentor
                  </button>
                  <button type="button" role="menuitem" onClick={requestDownload}>
                    <Icon name="download" size={13}/> Download PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="cvb-pgc-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready} aria-label="Readiness">
          <div className="cvb-pgc-bar-fill" style={{ width: `${ready}%` }} />
        </div>
        {saveState && <div className="cvb-pgc-savestate mono" role="status" aria-live="polite">{saveState}</div>}
        {dead.prompt}
        {externalError && <div className="cvb-pgc-err" role="alert">{externalError}</div>}
      </div>

      <div className="cvb-pgc-grid">
        <RaiseItRail
          token={token}
          plan={gapPlanQuery.data ?? null}
          targets={evaluatedTargets}
          pointsFor={pointsFor}
          onRaise={setRewriteTarget}
          jdText={jdText}
          onOpenIntake={() => setIntakeOpen(true)}
        />
        <CVEditor
          token={token}
          cv={cv}
          profile={profile}
          hiddenItems={hiddenItems}
          toggleItem={toggleItem}
          targets={evaluatedTargets}
          missingKeywords={evaluatedTargets.filter(t => !t.matched).map(t => t.kw)}
          applying={rewriteApply.isPending}
          onApply={(oldText, newText) => rewriteApply.mutate({ oldText, newText })}
          onAddBullet={(roleIndex, text) => addBullet.mutate({ roleIndex, text })}
          addingBullet={addBullet.isPending}
          visibleCount={visibleCount}
          wordCount={wordCount}
          rewriteTarget={rewriteTarget}
          onClearRewriteTarget={() => setRewriteTarget(null)}
        />
      </div>

      {exportConfirm && (
        <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Trim to fit one page" onClick={() => setExportConfirm(false)}>
          <div className="cvb-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="cvb-modal-head">Spills onto {pageFill.pages} pages</div>
            <div className="cvb-modal-body" style={{ padding: 18 }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
                Recruiters skim one page. Auto-trim hides your lowest-impact bullets until it fits — or download as-is.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
                <button type="button" className="cvb-btn sm" onClick={() => setExportConfirm(false)}>Cancel</button>
                <button type="button" className="cvb-btn sm" onClick={autoTrimToFit}><Icon name="sparkle" size={12}/> Auto-trim to fit</button>
                <button type="button" className="cvb-btn sm primary" onClick={() => { setExportConfirm(false); onExportPDF(ready) }}>
                  <Icon name="download" size={12}/> Download anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {intakeOpen && (
        <ExperienceIntake
          token={token}
          jdText={jdText}
          gapSkills={evaluatedTargets.filter(t => !t.matched).map(t => t.kw)}
          roles={roles}
          adding={addBullet.isPending}
          onAdd={(roleIndex, text) => addBullet.mutateAsync({ roleIndex, text }).then(() => {})}
          onClose={() => setIntakeOpen(false)}
        />
      )}

      {restructureOpen && selectedVersion && (
        <RestructureProposal
          token={token}
          versionId={selectedVersion.id}
          targetLabel={`${jobTitle} · ${company}`}
          onClose={() => setRestructureOpen(false)}
          onKept={(v) => {
            setRestructureOpen(false)
            selectVersion(v.id)
            queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
          }}
        />
      )}
    </div>
  )
}
