/**
 * MasterWorkspace — the Main-CV editing surface, unified with the CV Playground.
 *
 * Same shell as PlaygroundView (sticky score header · the CV-as-editor paper ·
 * tabbed rail · Preview), so editing your master CV feels identical to tailoring
 * one for a job. The nuance is small and honest:
 *   · header meter = the Myro Score, not a per-job Ready ("+N" is never claimed —
 *     a bullet rewrite doesn't move a radar/skill score);
 *   · no Job Description / Apply — those are job-only;
 *   · the paper's identity fields (name/email/phone…) + Education + Certifications
 *     are editable here and ONLY here (a tailored CV parents to this master — one
 *     source of truth for identity);
 *   · the Skills rail tab edits the master skills line (+ Refresh from proven
 *     skills) rather than showing a JD gap.
 *
 * Every write is a cheap living-master autosave patch (PUT /cv/master, no XP/LLM,
 * no rewrite baseline) — the same hook the old form used.
 */
"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { scores, users, cv as cvApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useMasterAutosave } from "@/lib/hooks/use-master-autosave"
import { CVEditor } from "./cv-editor"
import { FixesRail } from "./fixes-rail"
import { SkillProvenance } from "./skill-provenance"
import { V2Sheet } from "./preview-rail"
import { PlaygroundBottomNav } from "./playground-bottomnav"
import { PlaygroundHeader } from "./playground-header"
import { usePlaygroundModel } from "./use-playground-model"
import { useDismissedFixes } from "./use-dismissed-fixes"
import type { AppliedFix, V2Fix } from "./fix-model"

type MasterTab = "edit" | "fixes" | "skills" | "preview"

// Master CV has no per-job projection — every line renders.
const NO_HIDDEN: Set<string> = new Set()

interface MasterWorkspaceProps {
  token: string
  baseline: CVVersion | null
  /** Saved master, shown until the autosave draft hydrates. */
  cv: CVStructured
  profile: UserProfile | null
  onDone: () => void
}

export function MasterWorkspace({ token, baseline, cv, profile, onDone }: MasterWorkspaceProps) {
  const userKey = profile?.ninja_name?.trim() || profile?.email?.trim() || "anon"
  const autosave = useMasterAutosave({ token, enabled: true, userKey })
  // Deep-link: ?tab=skills opens straight on the Skills rail (the skill-audit home).
  const initialTab: MasterTab = useSearchParams().get("tab") === "skills" ? "skills" : "edit"
  const [tab, setTab] = useState<MasterTab>(initialTab)
  const [expandedFixId, setExpandedFixId] = useState<string | null>(null)
  const [appliedFixes, setAppliedFixes] = useState<AppliedFix[]>([])
  const [flash, setFlash] = useState<{ iid: string; n: number } | null>(null)
  const [addingProven, setAddingProven] = useState(false)
  const [provenStatus, setProvenStatus] = useState<string | null>(null)

  const scoreQuery = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token),
    staleTime: 5 * 60 * 1000,
  })
  const myroScore = scoreQuery.data?.total_score ?? 0

  const skillsQuery = useQuery({
    queryKey: dataKeys.userSkills(),
    queryFn: () => users.mySkills(token),
    staleTime: 5 * 60 * 1000,
  })
  const allSkills = useMemo(
    () => Object.values(skillsQuery.data?.by_domain ?? {}).flat(),
    [skillsQuery.data],
  )

  const draft = autosave.draft ?? cv
  const m = usePlaygroundModel(token, "", draft, profile, NO_HIDDEN, {
    mode: "master",
    masterScore: myroScore,
  })

  const openFixIds = useMemo(() => new Set(m.openFixes.map(f => f.id)), [m.openFixes])
  const appliedShown = appliedFixes.filter(a => !openFixIds.has(a.id))
  const railTab: "fixes" | "skills" = tab === "skills" ? "skills" : "fixes"

  const { dismissed, dismiss, restore } = useDismissedFixes("master")
  const visibleFixes = useMemo(
    () => m.openFixes.filter(f => !dismissed.has(f.id)),
    [m.openFixes, dismissed],
  )
  const dismissedFixes = useMemo(
    () => m.openFixes.filter(f => dismissed.has(f.id)),
    [m.openFixes, dismissed],
  )
  const fixCountLabel = visibleFixes.length > 0 ? String(visibleFixes.length) : "✓"

  const onPatch = (mut: (d: CVStructured) => CVStructured) =>
    autosave.update(mut(structuredClone(draft)))

  // Add proven-but-missing skills to the line, inline — no modal. The proposal
  // keeps every existing skill and only reorders + appends proven ones, so the
  // live textarea update above IS the review (retype to undo; autosave persists).
  async function addProvenToLine() {
    if (addingProven) return
    setAddingProven(true); setProvenStatus(null)
    try {
      const res = await cvApi.skillsRefresh(token)
      if (res.changed) {
        onPatch(d => ({ ...d, skills_line: res.proposed_skills_line }))
        setProvenStatus(`Added ${res.added.length} proven skill${res.added.length === 1 ? "" : "s"}`)
      } else {
        setProvenStatus("Already up to date")
      }
    } catch (e) {
      setProvenStatus(e instanceof Error ? e.message : "Couldn’t read your proven skills")
    } finally {
      setAddingProven(false)
    }
  }

  // A bullet rewrite / inline edit targets one line by its exact text (the same
  // text-identity the playground uses). First occurrence wins.
  function applyText(oldText: string, newText: string) {
    onPatch(d => {
      for (const e of d.experience) {
        const i = e.bullets.indexOf(oldText)
        if (i >= 0) { e.bullets[i] = newText; return d }
      }
      for (const p of d.projects) {
        const i = p.bullets.indexOf(oldText)
        if (i >= 0) { p.bullets[i] = newText; return d }
      }
      if (d.summary === oldText) d.summary = newText
      else if (d.skills_line === oldText) d.skills_line = newText
      return d
    })
  }
  function addBullet(roleIndex: number, text: string) {
    onPatch(d => {
      const ri = d.experience[roleIndex] ? roleIndex : d.experience.length - 1
      if (ri >= 0) d.experience[ri].bullets.push(text)
      return d
    })
  }

  function jumpTo(iid: string) { setFlash(prev => ({ iid, n: (prev?.n ?? 0) + 1 })) }
  function openFixCard(fix: V2Fix) { restore(fix.id); setTab("fixes"); setExpandedFixId(fix.id); jumpTo(fix.iid) }
  function dismissFix(fix: V2Fix) {
    if (expandedFixId === fix.id) setExpandedFixId(null)
    dismiss(fix.id, openFixIds)
  }
  function applyFixRewrite(fix: V2Fix, oldText: string, newText: string) {
    applyText(oldText, newText)
    setAppliedFixes(p => p.some(a => a.id === fix.id) ? p
      : [...p, { id: fix.id, iid: fix.iid, kind: fix.kind, title: fix.title, gain: fix.gain }])
    setExpandedFixId(null)
  }

  const saveState =
    autosave.status === "saving" ? "Saving…"
    : autosave.status === "error" ? "Couldn’t save"
    : autosave.recomputePending ? "Saved · re-scoring"
    : autosave.status === "saved" ? "Saved" : ""

  if (!autosave.ready || !autosave.draft) {
    return <div className="cvb-v2-loading">Loading your CV…</div>
  }

  return (
    <div className="cvb-v2" data-tab={tab}>
      <PlaygroundHeader
        variant="master"
        masterMeta={baseline ? `v${baseline.user_version_number} · autosaves` : "autosaves"}
        jobTitle="" company="Untitled company" reqCount={0}
        ready={m.ready} delta={0}
        canApply
        primaryLabel="Done"
        applyHint="Back to your CV library"
        saveState={saveState}
        hideOverflow
        onBack={onDone}
        onReqPill={() => {}}
        onApply={onDone}
        onDownload={onDone}
      />

      <div className="cvb-v2-main">
        <section className="cvb-v2-editor" aria-label="Your Main CV">
          <div className="cvb-v2-toolbar">
            <button
              type="button"
              className={`cvb-v2-tabbtn wide${tab === "preview" ? " active" : ""}`}
              onClick={() => setTab(tab === "preview" ? "edit" : "preview")}
            >Preview</button>
            <span className="cvb-v2-toolbar-label mono">Your Main CV</span>
            <span className="cvb-v2-headspacer" aria-hidden />
          </div>
          <div className="cvb-v2-editorbody">
            {tab === "preview" ? (
              <div className="cvb-v2-railpane">
                <p className="cvb-v2-rail-lede">
                  {m.pageFill.fits ? "Fits one page." : `Spills onto ${m.pageFill.pages} pages.`}{" "}
                  This is the sheet a recruiter reads.
                </p>
                <V2Sheet cv={draft} hidden={NO_HIDDEN} contact={m.sheetContact} />
              </div>
            ) : (
              <CVEditor
                token={token}
                cv={draft}
                profile={profile}
                hiddenItems={NO_HIDDEN}
                toggleItem={() => {}}
                targets={[]}
                missingKeywords={[]}
                applying={false}
                onApply={applyText}
                onAddBullet={addBullet}
                addingBullet={false}
                visibleCount={m.visibleCount}
                wordCount={m.wordCount}
                rewriteTarget={null}
                onClearRewriteTarget={() => {}}
                fixes={visibleFixes}
                applied={appliedShown}
                onFixPill={openFixCard}
                dismissedFixIds={dismissed}
                flash={flash}
                master={{ onPatch }}
              />
            )}
          </div>
        </section>

        <aside className="cvb-v2-rail" aria-label="CV quality">
          <div className="cvb-v2-railtabs">
            <button
              type="button"
              className={`cvb-v2-tabbtn${railTab === "fixes" ? " active" : ""}`}
              onClick={() => setTab("fixes")}
            >Fixes · {fixCountLabel}</button>
            <button
              type="button"
              className={`cvb-v2-tabbtn${railTab === "skills" ? " active" : ""}`}
              onClick={() => setTab("skills")}
            >Skills</button>
          </div>
          <div className="cvb-v2-railbody">
            {railTab === "fixes" ? (
              <FixesRail
                token={token}
                fixes={visibleFixes}
                applied={appliedShown}
                dismissed={dismissedFixes}
                delta={0}
                expandedId={expandedFixId}
                applying={false}
                hideGain
                onExpand={f => setExpandedFixId(f?.id ?? null)}
                onJump={jumpTo}
                onApply={applyFixRewrite}
                onDismiss={dismissFix}
                onRestore={f => restore(f.id)}
                onGoPreview={() => setTab("preview")}
                onOpenIntake={() => setTab("skills")}
              />
            ) : (
              <div className="cvb-v2-railpane">
                <p className="cvb-v2-rail-lede">
                  Your skills line — comma-separated, most relevant first. It shows on the CV
                  and helps ATS keyword matching.
                </p>
                <textarea
                  className="cvb-pgc-edit"
                  rows={5}
                  value={draft.skills_line ?? ""}
                  placeholder="Comma-separated skills."
                  onChange={e => onPatch(d => ({ ...d, skills_line: e.target.value }))}
                />
                <button
                  type="button"
                  className="cvb-v2-intakebtn"
                  onClick={addProvenToLine}
                  disabled={addingProven}
                >
                  ✦ {addingProven ? "Reading your proven skills…" : "Add proven skills"}
                </button>
                {provenStatus && <p className="cvb-prov-status" role="status">{provenStatus}</p>}

                <SkillProvenance allSkills={allSkills} />
              </div>
            )}
          </div>
        </aside>
      </div>

      <PlaygroundBottomNav tab={tab} fixCountLabel={fixCountLabel} onTab={setTab} />
    </div>
  )
}
