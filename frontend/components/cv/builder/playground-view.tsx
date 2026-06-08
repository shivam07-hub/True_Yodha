/**
 * PlaygroundView — per-job CV tailoring surface.
 *
 * Layout:
 *   [Page head + version tabs]
 *   Desktop: 2-pane below — [bullets editor] [preview + intel-strip]
 *            Intel drawer slides from the right when invoked.
 *   Mobile:  segmented switch [Edit | Preview] over a single pane.
 *
 * State machine lives in useCVPlayground — this is a thin shell.
 */
"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CVStructured,
  CVVersion,
  JobPathResponse,
  SkillGapResponse,
  UserProfile,
} from "@/lib/api"
import { jobs as jobsApi, cv as cvApi } from "@/lib/api"
import { PursuitStageControl } from "./pursuit-stage-control"
import { BulletRewrite } from "./bullet-rewrite"
import { itemId } from "@/lib/cv-compose"
import { dataKeys } from "@/lib/domain-data"
import { formatGlobalVersionLabel, formatThreadVersionLabel, timeAgo } from "@/lib/cv/version-format"
import type { CVPlaygroundState, CVWriteAction } from "@/lib/hooks/use-cv-playground"
import { Icon } from "./icons"
import { BulletRow } from "./bullet-row"
import { LivePreview } from "./live-preview"
import { IntelDrawer } from "./intel-drawer"
import {
  bulletKeywordHits,
  formatKeywordChipLabel,
  resolvePlaygroundCompany,
  targetsFromSkillGap,
  type KeywordTarget,
} from "./keyword-utils"
import { runAtsChecks, atsScore, type AtsCheck } from "./ats-checks"
import { IDEAL_CV_SPEC, estimateLines, pageFillFromLines, pageFillBand, type PageFill } from "@/lib/cv/page-fill"

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

function humanKind(kind: CVVersion["kind"]): string {
  switch (kind) {
    case "baseline_upload": return "Main CV"
    case "polished":        return "AI polished"
    case "edited":          return "edited copy"
    case "deterministic":   return "tailored CV"
    default:                return kind
  }
}

function tabKindDot(kind: CVVersion["kind"]) {
  if (kind === "baseline_upload") return { background: "var(--tm-interactive)", boxShadow: "0 0 4px var(--tm-int-bg-hover)" }
  if (kind === "polished") return { background: "#A78BFA", boxShadow: "none" }
  if (kind === "edited") return { background: "var(--tm-warning)", boxShadow: "none" }
  return { background: "var(--tm-text-muted)", boxShadow: "none" }
}

function slugCV(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function writeVerb(action: CVWriteAction): string {
  if (action === "polish") return "Polished copy"
  if (action === "edit") return "Edited copy"
  return "Saved copy"
}

export function PlaygroundView({
  token, jobId, playground, cv, profile,
  onBackToBaseline, onExportPDF, onEditPolished, externalError, focusSkill,
}: PlaygroundViewProps) {
  const { threadVersions, selectedVersionId, selectVersion, hiddenItems, toggleItem, isDirty, canSave } = playground

  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(false)
  const queryClient = useQueryClient()

  // Accept a per-bullet rewrite → writes a new Main-CV baseline (mirrors
  // skill-edit), so the stronger bullet flows to every tailored copy.
  const rewriteApply = useMutation({
    mutationFn: ({ oldText, newText }: { oldText: string; newText: string }) =>
      cvApi.rewriteApply(token, { old_text: oldText, new_text: newText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
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

  const job: Partial<JobPathResponse> = jobPathQuery.data ?? {}
  const gap: Partial<SkillGapResponse> = skillGapQuery.data ?? {}
  const application = applicationsQuery.data?.find(a => a.job_id === jobId) ?? null
  const jdText = application?.job_description?.trim() ?? ""
  const company = resolvePlaygroundCompany(job.company, gap.company)
  const jobTitle = job.job_title ?? gap.job_title ?? "Untitled role"

  const allTargets: KeywordTarget[] = useMemo(
    () => targetsFromSkillGap(gap.skills ?? []),
    [gap.skills],
  )

  const visibleText = useMemo(() => {
    const parts: string[] = []
    if (cv.summary && !hiddenItems.has(itemId("summary", 0, cv.summary))) parts.push(cv.summary)
    cv.experience.forEach((e, ei) => {
      e.bullets.forEach((b, bi) => {
        if (!hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b))) parts.push(b)
      })
    })
    cv.projects.forEach((p, pi) => {
      p.bullets.forEach((b, bi) => {
        if (!hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b))) parts.push(b)
      })
    })
    if (cv.skills_line && !hiddenItems.has(itemId("skills_line", 0, cv.skills_line))) parts.push(cv.skills_line)
    return parts.join(" ").toLowerCase()
  }, [hiddenItems, cv])

  const evaluatedTargets = useMemo<KeywordTarget[]>(
    () => allTargets.map(t => ({ ...t, matched: visibleText.includes(t.kw.toLowerCase()) })),
    [allTargets, visibleText],
  )
  const matchedTargets = evaluatedTargets.filter(t => t.matched)
  const missingTargets = evaluatedTargets.filter(t => !t.matched)

  const baseScore = job.readiness_pct ?? 0
  const matchScore = useMemo(() => {
    if (evaluatedTargets.length === 0) return baseScore
    const totalWeight = evaluatedTargets.reduce((s, h) => s + (h.weight ?? 1), 0)
    const got = matchedTargets.reduce((s, h) => s + (h.weight ?? 1), 0)
    return totalWeight === 0 ? 0 : Math.round((got / totalWeight) * 100)
  }, [evaluatedTargets, matchedTargets, baseScore])
  const delta = matchScore - baseScore

  const totalBullets = useMemo(() => {
    let n = 0
    cv.experience.forEach(e => { n += e.bullets.length })
    cv.projects.forEach(p => { n += p.bullets.length })
    return n
  }, [cv])
  const visibleCount = useMemo(() => {
    let n = 0
    cv.experience.forEach((e, ei) => {
      e.bullets.forEach((b, bi) => {
        if (!hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b))) n += 1
      })
    })
    cv.projects.forEach((p, pi) => {
      p.bullets.forEach((b, bi) => {
        if (!hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b))) n += 1
      })
    })
    return n
  }, [hiddenItems, cv])

  // Page-fill estimate (one-page guarantee). Deterministic line-budget model over
  // the VISIBLE content (DESIGN_cv_playground_redesign §5) — drives the meter and
  // the soft export block. Exact pagination stays the PDF's job.
  const pageFill: PageFill = useMemo(() => {
    const cpl = IDEAL_CV_SPEC.charsPerLine
    let lines = 3 // contact header: name + title + contact row
    if (cv.summary && !hiddenItems.has(itemId("summary", 0, cv.summary))) {
      lines += 1 + estimateLines(cv.summary, cpl)
    }
    let expVisible = false
    cv.experience.forEach((e, ei) => {
      const kept = e.bullets.filter((b, bi) => !hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b)))
      if (kept.length) {
        expVisible = true
        lines += 1 + kept.reduce((s, b) => s + estimateLines(b, cpl), 0) // role line + bullets
      }
    })
    if (expVisible) lines += 1 // section heading
    let projVisible = false
    cv.projects.forEach((p, pi) => {
      const kept = p.bullets.filter((b, bi) => !hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b)))
      if (kept.length) {
        projVisible = true
        lines += 1 + kept.reduce((s, b) => s + estimateLines(b, cpl), 0)
      }
    })
    if (projVisible) lines += 1
    const eduVisible = cv.education
      .map((ed, i) => ({ line: [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · "), i }))
      .filter(({ line, i }) => !hiddenItems.has(itemId("edu", i, line)))
    if (eduVisible.length) lines += 1 + eduVisible.length
    if (cv.skills_line && !hiddenItems.has(itemId("skills_line", 0, cv.skills_line))) {
      lines += 1 + estimateLines(cv.skills_line, cpl)
    }
    const certVisible = cv.certs.filter((c, i) => !hiddenItems.has(itemId("cert", i, c)))
    if (certVisible.length) lines += 1 + certVisible.length
    return pageFillFromLines(lines)
  }, [cv, hiddenItems])

  const selectedVersion = playground.selectedVersion
  const isEditableSelection = selectedVersion?.kind !== "baseline_upload"
  const writeReceipt = playground.lastWrite

  // Action law (L1): exactly one state-driven primary CTA lives in the top-bar
  // action group. Save while there are unsaved edits; otherwise Export. Polish /
  // Edit-text are secondary actions in the same group — never scattered, never
  // duplicated. The JD-match score lives in the meter (IntelStrip), not on a button.
  const isPolishable = isEditableSelection && !!selectedVersion && selectedVersion.kind !== "polished"
  const canEditPolished = isEditableSelection && !!selectedVersion
  const isSavePrimary = canSave

  // ATS checks — deterministic, client-side, no backend needed.
  const cvFilename = useMemo(() => {
    const parts = [slugCV(profile?.full_name) || "myro_cv", slugCV(company), slugCV(jobTitle)].filter(Boolean)
    return `${parts.join("__")}.pdf`
  }, [profile, company, jobTitle])
  const atsChecks = useMemo(() => runAtsChecks(cv, profile, cvFilename), [cv, profile, cvFilename])
  const atsSc = useMemo(() => atsScore(atsChecks), [atsChecks])

  function handleSave() { playground.saveVersion.mutate() }
  function handlePolish() {
    if (!selectedVersion) return
    playground.polishVersion.mutate(selectedVersion.id)
  }

  // Soft auto-trim: hide the lowest-impact visible bullets until the estimated
  // overflow is reclaimed. Best-effort single pass — the user watches the meter
  // recover and can trim further. Never deletes; only toggles visibility.
  function autoTrimToFit() {
    const overflow = Math.max(0, Math.round(pageFill.ratio * IDEAL_CV_SPEC.lineBudget) - IDEAL_CV_SPEC.lineBudget)
    setExportConfirm(false)
    if (overflow <= 0) return
    const cpl = IDEAL_CV_SPEC.charsPerLine
    const cands: { iid: string; impact: number; lines: number }[] = []
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      const iid = itemId("exp_bullet", ei * 100 + bi, b)
      if (hiddenItems.has(iid)) return
      cands.push({ iid, impact: bulletKeywordHits(b, evaluatedTargets).reduce((s, h) => s + (h.weight ?? 1), 0), lines: estimateLines(b, cpl) })
    }))
    cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
      const iid = itemId("proj_bullet", pi * 100 + bi, b)
      if (hiddenItems.has(iid)) return
      cands.push({ iid, impact: bulletKeywordHits(b, evaluatedTargets).reduce((s, h) => s + (h.weight ?? 1), 0), lines: estimateLines(b, cpl) })
    }))
    // Lowest impact first; tie-break: longer bullet first (frees more lines).
    cands.sort((a, b) => a.impact - b.impact || b.lines - a.lines)
    let freed = 0
    for (const c of cands) {
      if (freed >= overflow) break
      toggleItem(c.iid)
      freed += c.lines
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ padding: "20px 24px 0" }}>
        <div className="cvb-page-head" style={{ marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div className="cvb-crumbs">
              <button type="button" className="cvb-btn ghost sm" onClick={onBackToBaseline} style={{ padding: "2px 8px" }}>
                <Icon name="chevron-right" size={12} style={{ transform: "rotate(180deg)" }}/> CV Library
              </button>
              <span className="sep">/</span>
              <span className="accent">{company}</span>
              <span className="sep">/</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{jobTitle}</span>
            </div>
            <h1 className="cvb-page-title" style={{ marginTop: 8 }}>Tailor for {company}</h1>
            <p className="cvb-page-sub">
              Choose the proof this job needs. Myro keeps the saved copies in your CV Library.
            </p>
          </div>
          <div className="cvb-action-group">
            {application && (
              <PursuitStageControl token={token} application={application} />
            )}
            <button type="button" className="cvb-btn sm" onClick={() => setDrawerOpen(true)} title="Job description & keyword gaps">
              <Icon name="intel" size={13}/> Intel
              {missingTargets.length > 0 && (
                <span className="cvb-action-badge" aria-label={`${missingTargets.length} keyword gaps`}>{missingTargets.length}</span>
              )}
            </button>
            {(isPolishable || canEditPolished) && <span className="cvb-action-sep" aria-hidden="true" />}
            {isPolishable && (
              <button
                type="button"
                className="cvb-btn sm"
                onClick={handlePolish}
                disabled={playground.polishVersion.isPending}
                title="Rewrite this copy with AI"
              >
                <Icon name="sparkle" size={13}/>
                {playground.polishVersion.isPending ? "Polishing…" : "Polish"}
              </button>
            )}
            {canEditPolished && selectedVersion && (
              <button
                type="button"
                className="cvb-btn sm"
                onClick={() => onEditPolished(selectedVersion.id)}
                disabled={!selectedVersion.polished_text}
                title={selectedVersion.polished_text ? "Edit polished text" : "Polish first to edit"}
              >
                <Icon name="edit" size={13}/> Edit text
              </button>
            )}
            {isSavePrimary ? (
              <button
                type="button"
                className="cvb-btn sm primary"
                onClick={handleSave}
                disabled={!canSave || playground.saveVersion.isPending}
              >
                <Icon name="save" size={13}/>
                {playground.saveVersion.isPending ? "Saving…" : "Save"}
              </button>
            ) : (
              <button
                type="button"
                className="cvb-btn sm primary"
                onClick={() => pageFill.fits ? onExportPDF(matchScore) : setExportConfirm(true)}
                title={pageFill.fits ? "Export your one-page CV as PDF" : `Spills onto ${pageFill.pages} pages — trim to fit`}
              >
                <Icon name="download" size={13}/> Export PDF
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="cvb-version-tabs" role="tablist" aria-label="Saved CV copies">
        {threadVersions.map(v => {
          const active = selectedVersionId === v.id
          const dirty = active && isDirty
          return (
            <button
              type="button"
              key={v.id}
              role="tab"
              aria-selected={active}
              className={`cvb-version-tab${active ? " active" : ""}${dirty ? " dirty" : ""}`}
              onClick={() => selectVersion(v.id)}
            >
              <span className="v-label">
                <span className="v-dot" style={tabKindDot(v.kind)}/>
                {formatThreadVersionLabel(v, threadVersions)}
              </span>
              <span className="v-meta">
                {v.kind === "baseline_upload"
                  ? `Main CV · ${formatGlobalVersionLabel(v)}`
                  : `${formatGlobalVersionLabel(v)} · ${humanKind(v.kind)}`}
                {" · "}{timeAgo(v.created_at)}
              </span>
            </button>
          )
        })}
      </div>

      {writeReceipt && (
        <div className="cvb-save-confirm" role="status" aria-live="polite">
          <span>{writeVerb(writeReceipt.action)} to CV Library · Copy {writeReceipt.userVersionNumber}</span>
          <span style={{ opacity: 0.45 }}>·</span>
          <button type="button" className="cvb-save-confirm-dismiss" onClick={playground.clearLastWrite} aria-label="Dismiss save confirmation">
            Dismiss
          </button>
        </div>
      )}

      <div className="cvb-pg-seg">
        <button
          type="button"
          className={`seg${mobileTab === "edit" ? " active" : ""}`}
          onClick={() => setMobileTab("edit")}
        >
          <Icon name="edit" size={12}/> Edit · {visibleCount}/{totalBullets}
        </button>
        <button
          type="button"
          className={`seg${mobileTab === "preview" ? " active" : ""}`}
          onClick={() => setMobileTab("preview")}
        >
          <Icon name="eye" size={12}/> Preview
        </button>
      </div>

      <div className="cvb-pg-body">
        <div className={`cvb-pg-pane edit${mobileTab === "preview" ? " show-preview-mobile" : ""}`}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 12, flexWrap: "wrap" }}>
            <span className="eyebrow">experience · {visibleCount}/{totalBullets} visible</span>
            <span style={{ display: "inline-flex", gap: 6, fontSize: 11, color: "var(--tm-text-faint)", alignItems: "center" }}>
              <span className="cvb-kbd">click</span> to toggle
            </span>
          </div>

          {externalError && (
            <div role="alert" style={{
              padding: "8px 12px", fontSize: 12,
              color: "var(--tm-danger)", border: "1px solid var(--tm-danger)",
              borderRadius: 6, background: "var(--tm-danger-wash)",
            }}>{externalError}</div>
          )}

          <div className="cvb-card" style={{ overflow: "hidden" }}>
            {cv.experience.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
                No experience extracted from your Main CV yet.
              </div>
            )}
            {cv.experience.map((exp, ei) => (
              <div key={ei} className="cvb-role-block">
                <div className="cvb-role-head">
                  <div>
                    <div className="cvb-role-title">{exp.role}</div>
                    <div style={{ fontSize: 11.5, color: "var(--tm-text-muted)" }}>{exp.company}</div>
                  </div>
                  {exp.dates && <span className="cvb-role-dates">{exp.dates}</span>}
                </div>
                <div className="cvb-bullet-list">
                  {exp.bullets.map((bullet, bi) => {
                    const iid = itemId("exp_bullet", ei * 100 + bi, bullet)
                    const visible = !hiddenItems.has(iid)
                    return (
                      <div key={iid}>
                        <BulletRow
                          text={bullet}
                          hits={bulletKeywordHits(bullet, evaluatedTargets)}
                          hidden={!visible}
                          editable={false}
                          onToggle={() => toggleItem(iid)}
                        />
                        {visible && (
                          <BulletRewrite
                            token={token}
                            bullet={bullet}
                            role={exp.role}
                            missingKeywords={missingTargets.map(t => t.kw)}
                            applying={rewriteApply.isPending}
                            onApply={(oldText, newText) => rewriteApply.mutate({ oldText, newText })}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="cvb-save-bar">
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: "var(--tm-text-faint)", fontFamily: "var(--cvb-font-mono)", flexWrap: "wrap" }}>
              <span>{hiddenItems.size} hidden</span>
              <span style={{ opacity: 0.4 }}>·</span>
              {isDirty
                ? <span style={{ color: "var(--tm-warning)" }}>unsaved changes — Save in the top bar</span>
                : <span style={{ color: "var(--tm-success)" }}>
                    in sync{selectedVersion ? ` with ${formatThreadVersionLabel(selectedVersion, threadVersions)}` : ""}
                  </span>}
            </div>
          </div>
        </div>

        <div className={`cvb-pg-pane preview${mobileTab === "preview" ? " show-preview-mobile" : ""}`}>
          <IntelStrip
            score={matchScore}
            delta={delta}
            missing={missingTargets}
            allCovered={evaluatedTargets.length > 0 && missingTargets.length === 0}
            atsSc={atsSc}
            atsChecks={atsChecks}
            pageFill={pageFill}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <span className="eyebrow" style={{ color: isDirty ? "var(--tm-warning)" : "var(--tm-interactive)" }}>
              live preview · {isDirty ? "unsaved" : "synced"}
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--tm-text-faint)" }}>
              {visibleCount} bullets · ~{Math.round(visibleCount * 28)} words
            </span>
          </div>

          <LivePreview
            cv={cv}
            hidden={hiddenItems}
            keywords={evaluatedTargets}
            focusSkill={focusSkill}
            contact={{
              name: profile?.full_name?.trim() || "Your name",
              title: cv.experience[0]?.role ?? "",
              email: profile?.email ?? "",
              phone: "",
              linkedin: profile?.linkedin_url ?? "",
            }}
          />

          {gap.skills && gap.skills.length === 0 && (
            <Link
              href="/forge"
              style={{
                marginTop: 8, padding: 12, border: "1px dashed var(--tm-border-soft)",
                borderRadius: 8, textAlign: "center", fontSize: 11.5,
                color: "var(--tm-text-faint)", textDecoration: "none",
              }}
            >
              No target skills set for this job. <span style={{ color: "var(--tm-interactive)" }}>Pick targets →</span>
            </Link>
          )}
        </div>
      </div>

      <IntelDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        score={matchScore}
        baseScore={baseScore}
        matched={matchedTargets}
        missing={missingTargets}
        jdText={jdText}
        threadVersions={threadVersions}
        selectedVId={selectedVersionId}
        jobLabel={`${company} · ${jobTitle}`}
      />

      {exportConfirm && (
        <div
          className="cvb-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Trim to fit one page"
          onClick={() => setExportConfirm(false)}
        >
          <div className="cvb-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="cvb-modal-head">Spills onto {pageFill.pages} pages</div>
            <div className="cvb-modal-body" style={{ padding: 18 }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
                Recruiters skim one page. Auto-trim hides your lowest-impact bullets until it fits — or export as-is.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
                <button type="button" className="cvb-btn sm" onClick={() => setExportConfirm(false)}>Cancel</button>
                <button type="button" className="cvb-btn sm" onClick={autoTrimToFit}>
                  <Icon name="sparkle" size={12}/> Auto-trim to fit
                </button>
                <button type="button" className="cvb-btn sm primary" onClick={() => { setExportConfirm(false); onExportPDF(matchScore) }}>
                  <Icon name="download" size={12}/> Export anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface IntelStripProps {
  score: number
  delta: number
  missing: KeywordTarget[]
  allCovered: boolean
  atsSc: { passed: number; total: number }
  atsChecks: AtsCheck[]
  pageFill: PageFill
}

function IntelStrip({ score, delta, missing, allCovered, atsSc, atsChecks, pageFill }: IntelStripProps) {
  const atsAllPass = atsSc.passed === atsSc.total
  const atsFailedLabels = atsChecks.filter(c => !c.pass).map(c => c.detail ?? c.label)
  const scoreLabel = missing.length > 0
    ? `${missing.length} skill${missing.length === 1 ? "" : "s"} to add`
    : allCovered
      ? "Ready to export"
      : "No JD targets yet"

  return (
    <div className="cvb-intel-strip" style={{ flexWrap: "wrap", gap: 10 }}>
      <div className="score">
        <span className="num tabnum">
          {score}<span style={{ fontSize: 14, opacity: 0.7 }}>%</span>
        </span>
        <div className="delta">
          <div style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10, color: "var(--tm-text-faint)" }}>JD match</div>
          <div>
            {delta > 0 ? (
              <>
                <strong>+{delta}</strong>{" "}vs. Main CV
              </>
            ) : scoreLabel}
          </div>
        </div>
      </div>

      <span
        className={`cvb-pill${atsAllPass ? " success" : " warning"}`}
        title={atsAllPass ? "All ATS checks pass" : atsFailedLabels.join(" · ")}
        style={{ cursor: "default", fontSize: 11 }}
      >
        <Icon name={atsAllPass ? "check" : "x"} size={10} stroke={3}/>
        ATS {atsSc.passed}/{atsSc.total}
      </span>

      <span
        className={`cvb-pill${pageFill.fits ? " success" : pageFillBand(pageFill) === "tight" ? " warning" : " danger"}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, pageFill.pct)}
        aria-valuetext={`${pageFill.pct}% of one page`}
        aria-label="Page fill"
        title={pageFill.fits ? "Fits on one page" : `Spills onto ${pageFill.pages} pages — trim to fit`}
        style={{ cursor: "default", fontSize: 11 }}
      >
        <Icon name={pageFill.fits ? "check" : "x"} size={10} stroke={3}/>
        Page {pageFill.pct}%
      </span>

      <div className="gaps" style={{ flex: 1 }}>
        {allCovered ? (
          <span className="cvb-pill success">
            <Icon name="check" size={10} stroke={3}/> all JD keywords covered
          </span>
        ) : missing.length === 0 ? (
          <span className="eyebrow" style={{ fontSize: 10.5 }}>no targets yet</span>
        ) : (
          <>
            <span style={{ fontSize: 10.5, color: "var(--tm-text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 4 }}>gaps</span>
            {missing.slice(0, 3).map(k => (
              <span key={k.kw} className="cvb-kw-chip miss" style={{ fontSize: 10.5 }}>
                <span className="dot"/>{formatKeywordChipLabel(k.kw)}
              </span>
            ))}
            {missing.length > 3 && (
              <span style={{ fontSize: 10.5, color: "var(--tm-text-faint)", fontFamily: "var(--cvb-font-mono)" }}>
                +{missing.length - 3}
              </span>
            )}
          </>
        )}
      </div>
      {missing.length > 0 ? (
        <Link href="/forge" className="cvb-btn primary sm" style={{ textDecoration: "none" }}>
          <Icon name="sparkle" size={12}/> Practice them
        </Link>
      ) : null}
    </div>
  )
}
