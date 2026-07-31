/**
 * SkillsRail — the one place a user sees what Myro read out of their CV.
 *
 * Two modes, deliberately the same surface:
 *
 *   confirm — first run. The extraction is shown over the user's real CV,
 *             beside the CV, before anything is published. Nothing is scored
 *             until they press Confirm.
 *   edit    — every visit afterwards. Identical layout, identical controls; a
 *             skill removed here is removed for good and the score recomputes.
 *
 * Onboarding used to do this on a separate full-page screen (a flat list of
 * names with a "Remove" link) which the user saw exactly once and never again,
 * disconnected from the CV it was describing. Same job, two surfaces, one of
 * them a dead end. Now the first-run screen IS the permanent surface, so the
 * thing learned in the first two minutes keeps working forever — and the user
 * learns where their skills live by being taken there, not by being told.
 */
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { UserSkillItem } from "@/lib/api"
import { onboarding, users } from "@/lib/api"
import { buildScoreMapHref } from "@/lib/score-map"
import { SkillProvenance } from "./skill-provenance"

export interface SkillsRailConfirm {
  baselineVersionId: number
  /** Candidates from the onboarding payload, already in UserSkillItem shape. */
  candidates: UserSkillItem[]
  onConfirmed: () => void
}

interface SkillsRailProps {
  token: string
  skillsLine: string | null | undefined
  onSkillsLineChange: (value: string) => void
  onAddProven: () => void
  addingProven: boolean
  provenStatus: string | null
  /** Published skills. Ignored in confirm mode — nothing is published yet. */
  allSkills: UserSkillItem[]
  focusSkill?: string | null
  scoreDomain?: string | null
  fromScoreMap?: boolean
  confirm?: SkillsRailConfirm | null
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
  confirm,
  onSkillsChanged,
}: SkillsRailProps) {
  // Removed skills are held as whole rows, not just keys. In edit mode the
  // removal really deletes the row, so the next refetch drops it from
  // `allSkills` — without the captured copy the chip would vanish instead of
  // showing as restorable, and an undo the user cannot see is not an undo.
  const [removedItems, setRemovedItems] = useState<Map<string, UserSkillItem>>(new Map())
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const skills = confirm ? confirm.candidates : allSkills
  const removed = useMemo(() => new Set(removedItems.keys()), [removedItems])
  const keptCount = skills.filter((skill) => !removed.has(skill.key)).length

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

  /** Confirm mode holds the decision locally; edit mode writes it immediately. */
  async function toggleRemoved(key: string) {
    setError(null)
    const item = skills.find((skill) => skill.key === key) ?? removedItems.get(key)
    if (!item) return
    const isRestoring = removed.has(key)

    if (confirm) {
      if (isRestoring) undrop(key)
      else drop(item)
      return
    }

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

  async function submitConfirmation() {
    if (!confirm || busy || keptCount < 1) return
    setBusy(true)
    setError(null)
    try {
      await onboarding.confirmSkills(
        token,
        confirm.baselineVersionId,
        Array.from(removed).map((key) => ({ taxonomy_key: key, action: "exclude" as const })),
      )
      confirm.onConfirmed()
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : "Your skills could not be confirmed.")
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

      {confirm ? (
        <p className="cvb-v2-rail-lede">
          This is what Myro read out of your CV, and the line it read each skill from.
          Drop anything that isn&apos;t yours — your score and job matches will use
          only what you keep.
        </p>
      ) : (
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
      )}

      <SkillProvenance
        allSkills={rendered}
        focusSkill={focusSkill}
        skillsLine={skillsLine}
        removed={removed}
        onToggleRemoved={(key) => void toggleRemoved(key)}
        pendingKeys={pending}
      />

      {error && <p className="cvb-prov-error" role="alert">{error}</p>}

      {confirm && (
        <button
          type="button"
          className="cvb-prov-confirm tm-control-focus"
          onClick={() => void submitConfirmation()}
          disabled={busy || keptCount < 1}
        >
          {busy
            ? "Confirming…"
            : keptCount < 1
              ? "Keep at least one skill"
              : `Confirm ${keptCount} skills → see my score`}
        </button>
      )}
    </div>
  )
}
