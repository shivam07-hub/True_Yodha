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
  focusSkill?: string | null
  scoreDomain?: string | null
  fromScoreMap?: boolean
  /** Called after a correction lands so the caller can refetch score + skills. */
  onSkillsChanged?: () => void
}

export function SkillsRail({
  token,
  skillsLine,
  onSkillsLineChange,
  onAddProven,
  addingProven,
  provenStatus,
  allSkills,
  focusSkill,
  scoreDomain,
  fromScoreMap,
  onSkillsChanged,
}: SkillsRailProps) {
  // Removed skills are held as whole rows, not just keys. In edit mode the
  // removal really deletes the row, so the next refetch drops it from
  // `allSkills` — without the captured copy the chip would vanish instead of
  // showing as restorable, and an undo the user cannot see is not an undo.
  const [removedItems, setRemovedItems] = useState<Map<string, UserSkillItem>>(new Map())
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const skills = allSkills
  const removed = useMemo(() => new Set(removedItems.keys()), [removedItems])

  function drop(item: UserSkillItem) {
    setRemovedItems((current) => new Map(current).set(item.key, item))
  }

  function undrop(key: string) {
    setRemovedItems((current) => {
      const next = new Map(current)
      next.delete(key)
      return next
    })
  }

  async function toggleRemoved(key: string) {
    setError(null)
    const item = skills.find((skill) => skill.key === key) ?? removedItems.get(key)
    if (!item) return
    const isRestoring = removed.has(key)

    setPending((current) => new Set(current).add(key))
    try {
      await users.correctSkill(token, key, isRestoring)
      if (isRestoring) undrop(key)
      else drop(item)
      onSkillsChanged?.()
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

  const rendered = useMemo(() => {
    const byKey = new Map(skills.map((skill) => [skill.key, skill]))
    for (const [key, item] of Array.from(removedItems.entries())) {
      if (!byKey.has(key)) byKey.set(key, item)
    }
    return Array.from(byKey.values())
  }, [skills, removedItems])

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
        <p className="cvb-v2-rail-lede">
          Your skills line — comma-separated, most relevant first. It shows on the CV
          and helps ATS keyword matching.
        </p>
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
