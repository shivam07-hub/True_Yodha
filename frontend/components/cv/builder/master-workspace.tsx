/**
 * MasterWorkspace — the Main-CV surface, on the shared workstation shell.
 *
 * Same shell as the per-job playground (hierarchy redesign, handoff 2a), so
 * editing your master CV and tailoring one for a job are the same screen. The
 * honest differences are small:
 *   · the header meter is the Myro Score, not a per-job Match, and no "+N" is
 *     claimed — a bullet rewrite does not move a radar/skill score;
 *   · no Apply and no JD — those are job-only;
 *   · identity fields are editable HERE and only here (a tailored CV parents to
 *     this master — one source of truth for who you are);
 *   · no per-job projection, so lines cannot be hidden;
 *   · the Skills lane edits the master skills line rather than showing a JD gap,
 *     so nothing on this surface can say "on target" — there is no target.
 *
 * Every write is a cheap living-master autosave patch (PUT /cv/master).
 */
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { scores, users, cv as cvApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { dataKeys } from "@/lib/domain-data"
import { useMasterAutosave } from "@/lib/hooks/use-master-autosave"
import { mentorRewriteTarget } from "@/lib/cv/mentor-rewrite-target"
import { masterFilename } from "@/lib/cv/download-master"
import { SkillsRail } from "./skills-rail"
import { PdfPage } from "./pdf-page"
import { PlaygroundHeader } from "./playground-header"
import { WorkstationShell } from "./workstation-shell"
import { runAtsChecks } from "./ats-checks"
import { identityLines } from "./cv-identity-lines"
import { rewriteFetcher } from "./rewrite-fetchers"
import { usePlaygroundModel } from "./use-playground-model"
import { useDismissedFixes } from "./use-dismissed-fixes"

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
  const autosave = useMasterAutosave({ token, enabled: true, userKey, seed: cv })
  const searchParams = useSearchParams()
  // Deep links into this surface: the skill audit lands on Skills, and a score-map
  // "rewrite the line that proves this skill" lands ON that line.
  const initialRailTab = searchParams.get("tab") === "skills" ? "skills" as const : "fixes" as const
  const requestedMentorSkill = searchParams.get("mentor") === "1" ? searchParams.get("skill") : null
  const requestedProvenSkill = searchParams.get("addProven") === "1" ? searchParams.get("skill") : null
  const fromScoreMap = searchParams.get("from") === "score-map"
  const scoreDomain = fromScoreMap ? searchParams.get("domain") : null
  const scoreSkill = fromScoreMap ? searchParams.get("skill") : null
  const [addingProven, setAddingProven] = useState(false)
  const [provenStatus, setProvenStatus] = useState<string | null>(null)
  const [mentorIid, setMentorIid] = useState<string | null>(null)
  const [mentorMiss, setMentorMiss] = useState(false)
  const mentorResolved = useRef(false)
  const provenHandoffHandled = useRef(false)

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
  const { dismissed } = useDismissedFixes("master")

  const filename = useMemo(
    () => masterFilename(draft.contact?.name ?? profile?.full_name ?? null),
    [draft.contact?.name, profile?.full_name],
  )
  const atsChecks = useMemo(
    () => runAtsChecks(draft, profile, filename),
    [draft, profile, filename],
  )

  const onPatch = useCallback(
    (mut: (d: CVStructured) => CVStructured) =>
      autosave.update(mut(structuredClone(draft))),
    [autosave, draft],
  )

  // Add proven-but-missing skills to the line, inline — no modal. The proposal
  // keeps every existing skill and only reorders + appends proven ones, so the
  // live textarea update IS the review (retype to undo; autosave persists).
  const addProvenToLine = useCallback(async (focusSkill?: string | null) => {
    if (addingProven) return
    setAddingProven(true); setProvenStatus(null)
    try {
      const res = await cvApi.skillsRefresh(token, null, focusSkill)
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
  }, [addingProven, onPatch, token])

  // Resolve the deep-linked skill to the CV line that proves it. A miss is said
  // out loud — silently landing on the wrong line is worse than saying we can't.
  useEffect(() => {
    if (!requestedMentorSkill || mentorResolved.current || !skillsQuery.isSuccess) return
    mentorResolved.current = true
    const target = mentorRewriteTarget(draft, allSkills, requestedMentorSkill)
    if (target) setMentorIid(target.iid)
    else setMentorMiss(true)
  }, [allSkills, draft, requestedMentorSkill, skillsQuery.isSuccess])

  useEffect(() => {
    if (!requestedProvenSkill || provenHandoffHandled.current) return
    provenHandoffHandled.current = true
    void addProvenToLine(requestedProvenSkill)
  }, [addProvenToLine, requestedProvenSkill])

  // A rewrite or inline edit targets one line by its exact text (the same
  // text-identity the playground uses). First occurrence wins.
  const applyText = useCallback((oldText: string, newText: string) => {
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
  }, [onPatch])

  const saveState =
    autosave.status === "saving" ? "Saving…"
    : autosave.status === "error" ? "Couldn’t save"
    : autosave.recomputePending ? "Saved · re-scoring"
    : autosave.status === "saved" ? "Saved" : ""

  return (
    <WorkstationShell
      initialRailTab={initialRailTab}
      requestOpenIid={mentorIid}
      header={
        <>
        <PlaygroundHeader
          variant="master"
          masterMeta={baseline ? `v${baseline.user_version_number} · autosaves` : "autosaves"}
          jobTitle="" company="Untitled company" reqCount={0}
          ready={m.ready}
          delta={0}
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
        {mentorMiss && (
          <div className="cvb-pgc-err" role="alert">
            Mentor needs a CV line that shows this skill before it can rewrite it.
            <Button variant="neutral" size="sm" onClick={() => setMentorMiss(false)}>Got it</Button>
          </div>
        )}
        </>
      }
      railLabel="CV quality"
      cv={draft}
      identity={identityLines(draft, profile)}
      hidden={NO_HIDDEN}
      targeted={false}
      atsChecks={atsChecks}
      pageFill={m.pageFill}
      lineCount={m.visibleCount}
      wordCount={m.wordCount}
      dismissed={dismissed}
      makeFetcher={(bullet, quantifyOnly) =>
        rewriteFetcher.authed(token, bullet, draft.contact?.title ?? null, quantifyOnly)}
      onApplyRewrite={({ oldText, newText }) => applyText(oldText, newText)}
      onEditLine={applyText}
      onPatch={onPatch}
      identityEditable
      userSkills={skillsQuery.data}
      onAddBullet={(roleIndex, text) => onPatch(d => {
        const ri = d.experience[roleIndex] ? roleIndex : d.experience.length - 1
        if (ri >= 0) d.experience[ri].bullets.push(text)
        return d
      })}
      skillsLabel="Skills"
      skillsPane={
        <SkillsRail
          token={token}
          skillsLine={draft.skills_line}
          onSkillsLineChange={value => onPatch(d => ({ ...d, skills_line: value }))}
          onAddProven={() => addProvenToLine()}
          addingProven={addingProven}
          provenStatus={provenStatus}
          allSkills={allSkills}
          focusSkill={scoreSkill ?? requestedProvenSkill}
          scoreDomain={scoreDomain}
          fromScoreMap={fromScoreMap}
          onSkillsChanged={() => {
            void skillsQuery.refetch()
            void scoreQuery.refetch()
          }}
        />
      }
      railFooter={
        <Button variant="neutral" size="sm" onClick={onDone}>Back to CV library</Button>
      }
      sheet={
        <div className="cvb-scope">
          <PdfPage
            cv={draft}
            hidden={NO_HIDDEN}
            contact={{
              name: identityLines(draft, profile).name,
              title: draft.contact?.title?.trim() || draft.experience[0]?.role || "",
              location: draft.contact?.location?.trim() || "",
              email: draft.contact?.email?.trim() || profile?.email || "",
              phone: draft.contact?.phone?.trim() || "",
              linkedin: draft.contact?.linkedin?.trim() || profile?.linkedin_url || "",
            }}
            footerMarkHidden={baseline?.footer_mark_hidden ?? false}
          />
        </div>
      }
    />
  )
}
