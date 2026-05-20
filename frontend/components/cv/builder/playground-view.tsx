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
import { useQuery } from "@tanstack/react-query"
import type {
  CVStructured,
  CVVersion,
  JobPathResponse,
  SkillGapResponse,
  UserProfile,
} from "@/lib/api"
import { jobs as jobsApi } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { dataKeys } from "@/lib/domain-data"
import { formatGlobalVersionLabel, formatThreadVersionLabel, timeAgo } from "@/lib/cv/version-format"
import type { CVPlaygroundState } from "@/lib/hooks/use-cv-playground"
import { Icon } from "./icons"
import { BulletRow } from "./bullet-row"
import { LivePreview } from "./live-preview"
import { IntelDrawer } from "./intel-drawer"
import { bulletKeywordHits, targetsFromSkillGap, type KeywordTarget } from "./keyword-utils"

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
}

function tabKindDot(kind: CVVersion["kind"]) {
  if (kind === "baseline_upload") return { background: "var(--tm-accent)", boxShadow: "0 0 4px var(--tm-accent-glow)" }
  if (kind === "polished") return { background: "#A78BFA", boxShadow: "none" }
  if (kind === "edited") return { background: "var(--tm-warning)", boxShadow: "none" }
  return { background: "var(--tm-text-muted)", boxShadow: "none" }
}

export function PlaygroundView({
  token, jobId, playground, cv, profile,
  onBackToBaseline, onExportPDF, onEditPolished, externalError,
}: PlaygroundViewProps) {
  const { threadVersions, selectedVersionId, selectVersion, hiddenItems, toggleItem, isDirty, canSave } = playground

  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit")
  const [drawerOpen, setDrawerOpen] = useState(false)

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
  const company = job.company ?? gap.company ?? "Selected role"
  const jobTitle = job.job_title ?? gap.job_title ?? ""

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

  const selectedVersion = playground.selectedVersion
  const isEditableSelection = selectedVersion?.kind !== "baseline_upload"

  function handleSave() { playground.saveVersion.mutate() }
  function handlePolish() {
    if (!selectedVersion) return
    playground.polishVersion.mutate(selectedVersion.id)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ padding: "20px 24px 0" }}>
        <div className="cvb-page-head" style={{ marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div className="cvb-crumbs">
              <button type="button" className="cvb-btn ghost sm" onClick={onBackToBaseline} style={{ padding: "2px 8px" }}>
                <Icon name="chevron-right" size={12} style={{ transform: "rotate(180deg)" }}/> baseline
              </button>
              <span className="sep">/</span>
              <span className="accent">{company}</span>
              <span className="sep">/</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{jobTitle}</span>
            </div>
            <h1 className="cvb-page-title" style={{ marginTop: 8 }}>Tailor for {company}</h1>
            <p className="cvb-page-sub">
              Toggle bullets · click to edit · live JD-match score on the right.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="cvb-btn sm" onClick={() => setDrawerOpen(true)} title="Open JD intel">
              <Icon name="intel" size={13}/> Intel
              {missingTargets.length > 0 && (
                <span style={{
                  display: "inline-grid", placeItems: "center",
                  minWidth: 16, height: 16, padding: "0 4px",
                  borderRadius: 99, fontSize: 10, fontWeight: 600,
                  background: "var(--tm-warning)", color: "#000",
                }}>{missingTargets.length}</span>
              )}
            </button>
            {isEditableSelection && selectedVersion && (
              <button
                type="button"
                className="cvb-btn sm"
                onClick={() => onEditPolished(selectedVersion.id)}
                disabled={!selectedVersion.polished_text}
                title={selectedVersion.polished_text ? "Edit polished text" : "Polish first to edit"}
              >
                <Icon name="edit" size={13}/> Edit polished
              </button>
            )}
            <button type="button" className="cvb-btn sm" onClick={() => onExportPDF(matchScore)}>
              <Icon name="download" size={13}/> Export PDF
            </button>
            <button
              type="button"
              className="cvb-btn primary sm"
              onClick={handleSave}
              disabled={!canSave || playground.saveVersion.isPending}
            >
              <Icon name="git-commit" size={13}/>
              {playground.saveVersion.isPending ? "Saving…" : "Save commit"}
            </button>
          </div>
        </div>
      </div>

      <div className="cvb-version-tabs" role="tablist" aria-label="CV versions">
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
                {v.kind === "baseline_upload" ? `baseline · ${formatGlobalVersionLabel(v)}` : `${formatGlobalVersionLabel(v)} · ${v.kind}`}
                {" · "}{timeAgo(v.created_at)}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          className="cvb-version-tab new-tab"
          title="Save as new version"
          aria-label="Save as new version"
          onClick={handleSave}
          disabled={!canSave || playground.saveVersion.isPending}
        >
          <Icon name="plus" size={14}/>
        </button>
      </div>

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
              <span className="cvb-kbd">click</span> bullet to edit
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
                No experience extracted from your baseline yet.
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
                    return (
                      <BulletRow
                        key={iid}
                        text={bullet}
                        hits={bulletKeywordHits(bullet, evaluatedTargets)}
                        hidden={hiddenItems.has(iid)}
                        editable={false}
                        onToggle={() => toggleItem(iid)}
                      />
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
                ? <span style={{ color: "var(--tm-warning)" }}>unsaved changes</span>
                : <span style={{ color: "var(--tm-success)" }}>
                    in sync{selectedVersion ? ` with ${formatThreadVersionLabel(selectedVersion, threadVersions)}` : ""}
                  </span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {isEditableSelection && selectedVersion && selectedVersion.kind !== "polished" && (
                <button
                  type="button"
                  className="cvb-btn sm"
                  onClick={handlePolish}
                  disabled={playground.polishVersion.isPending}
                >
                  <Icon name="sparkle" size={11}/>
                  {playground.polishVersion.isPending ? "Polishing…" : "Polish with AI"}
                </button>
              )}
              <button
                type="button"
                className="cvb-btn sm primary"
                onClick={handleSave}
                disabled={!canSave || playground.saveVersion.isPending}
              >
                <Icon name="git-commit" size={11}/>
                {playground.saveVersion.isPending ? "Saving…" : "Save commit"}
              </button>
            </div>
          </div>
        </div>

        <div className={`cvb-pg-pane preview${mobileTab === "preview" ? " show-preview-mobile" : ""}`}>
          <IntelStrip
            score={matchScore}
            delta={delta}
            missing={missingTargets}
            allCovered={evaluatedTargets.length > 0 && missingTargets.length === 0}
            onOpenDrawer={() => setDrawerOpen(true)}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <span className="eyebrow" style={{ color: isDirty ? "var(--tm-warning)" : "var(--tm-accent)" }}>
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
              href="/skills"
              style={{
                marginTop: 8, padding: 12, border: "1px dashed var(--tm-border-soft)",
                borderRadius: 8, textAlign: "center", fontSize: 11.5,
                color: "var(--tm-text-faint)", textDecoration: "none",
              }}
            >
              No target skills set for this job. <span style={{ color: "var(--tm-accent)" }}>Pick targets →</span>
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
    </div>
  )
}

interface IntelStripProps {
  score: number
  delta: number
  missing: KeywordTarget[]
  allCovered: boolean
  onOpenDrawer: () => void
}

function IntelStrip({ score, delta, missing, allCovered, onOpenDrawer }: IntelStripProps) {
  const dir = delta >= 0 ? "up" : "down"
  return (
    <div className="cvb-intel-strip">
      <div className="score">
        <span className="num tabnum">
          {score}<span style={{ fontSize: 14, opacity: 0.7 }}>%</span>
        </span>
        <div className="delta">
          <div style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10, color: "var(--tm-text-faint)" }}>JD match</div>
          <div>
            <strong className={dir === "down" ? "down" : ""}>
              {delta >= 0 ? "+" : ""}{delta}
            </strong>{" "}vs. baseline
          </div>
        </div>
      </div>
      <div className="gaps">
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
                <span className="dot"/>{k.kw}
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
      <button type="button" className="cvb-btn ghost sm" onClick={onOpenDrawer}>
        <Icon name="intel" size={12}/> View intel
      </button>
    </div>
  )
}
