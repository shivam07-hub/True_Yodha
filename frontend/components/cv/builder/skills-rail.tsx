/**
 * SkillsRail — the one place a user sees what Myro read out of their CV.
 *
 * First-run review is a focused onboarding step. This permanent rail remains
 * the correction home after onboarding, backed by the same evidence rules.
 */
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { UserSkillItem } from "@/lib/api"
import { users } from "@/lib/api"
import { buildScoreMapHref } from "@/lib/score-map"
import { SkillProvenance } from "./skill-provenance"

interface SkillsRailProps {
  token: string
  skillsLine: string | null | undefined
  onSkillsLineChange: (value: string) => void
  onAddProven: () => void
  addingProven: boolean
  provenStatus: string | null
  allSkills: UserSkillItem[]
  removedSkills: UserSkillItem[]
  focusSkill?: string | null
  scoreDomain?: string | null
  fromScoreMap?: boolean
  /** Called after a correction lands. Resolves once the skills have refetched. */
  onSkillsChanged?: () => void | Promise<void>
}

export function SkillsRail({
  token,
  skillsLine,
  onSkillsLineChange,
  onAddProven,
  addingProven,
  provenStatus,
  allSkills,
  removedSkills,
  focusSkill,
  scoreDomain,
  fromScoreMap,
  onSkillsChanged,
}: SkillsRailProps) {
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // A live row wins: a ruling can outlast its skill coming back.
  const restorable = useMemo(() => {
    const held = new Set(allSkills.map((skill) => skill.key))
    return removedSkills.filter((skill) => !held.has(skill.key))
  }, [allSkills, removedSkills])
  const removed = useMemo(() => new Set(restorable.map((skill) => skill.key)), [restorable])
  const rendered = useMemo(() => [...allSkills, ...restorable], [allSkills, restorable])

  async function toggleRemoved(key: string) {
    setError(null)
    setPending((current) => new Set(current).add(key))
    try {
      await users.correctSkill(token, key, removed.has(key))
      await onSkillsChanged?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That change could not be saved.")
    } finally {
      setPending((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  return (
    <div className="cvb-v2-railpane">
      {fromScoreMap && (
        <Link
          className="cvb-score-context tm-control-focus"
          href={buildScoreMapHref({ domain: scoreDomain, skill: focusSkill })}
        >
          <span>Score &amp; skills</span>
          {scoreDomain && <strong>{scoreDomain}</strong>}
          {focusSkill && <em>{focusSkill}</em>}
        </Link>
      )}

      <>
        {/* No lede. The field is a comma-separated list and the placeholder
            says so; a paragraph explaining a textarea is the instructional
            prose the hierarchy redesign deletes on every surface (§2). */}
        <textarea
          className="cvb-pgc-edit"
          rows={5}
          value={skillsLine ?? ""}
          placeholder="Comma-separated skills."
          onChange={(event) => onSkillsLineChange(event.target.value)}
        />
        <button
          type="button"
          className="cvb-v2-intakebtn"
          onClick={onAddProven}
          disabled={addingProven}
        >
          ✦ {addingProven ? "Reading your proven skills…" : "Add proven skills"}
        </button>
        {provenStatus && <p className="cvb-prov-status" role="status">{provenStatus}</p>}
      </>

      <SkillProvenance
        allSkills={rendered}
        focusSkill={focusSkill}
        skillsLine={skillsLine}
        removed={removed}
        onToggleRemoved={(key) => void toggleRemoved(key)}
        pendingKeys={pending}
      />

      {error && <p className="cvb-prov-error" role="alert">{error}</p>}

    </div>
  )
}
