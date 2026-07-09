/**
 * SkillsRail — CV Playground v2 right-rail "Skills" tab: the job's requirements
 * as a levelled checklist (✓ covered · ◐ partial · ✗ missing).
 *
 * Skills are LEVELLED (L1–L5): a requirement isn't just present/absent — the job
 * asks a level, and a skill you show below that level is a gap with a level note
 * (L2 → L4) whose fix raises the level phrasing, not just the keyword. Row
 * classification comes from the gap plan; covered state reads the LIVE text, so
 * applying a fix ticks the row green instantly.
 *
 * Actions are the honest ones only: Fix it (a host bullet exists → its fix card),
 * Add it (no proof → brain-dump intake), Practice (no evidence to phrase → earn
 * it in Forge).
 */
"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { users as usersApi, type CVStructured, type GapPlanResponse, type SkillGapItem } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import type { V2Fix } from "./fix-model"
import type { KeywordTarget } from "./keyword-utils"

type RowStatus = "covered" | "partial" | "missing"

interface SkillRow {
  name: string
  status: RowStatus
  note: string
  /** The levelled-skill nuance: "L2 → L4" (below level) or "asks L3" (absent). */
  levelNote: string | null
  action:
    | { kind: "fix"; fix: V2Fix }
    | { kind: "add" }
    | { kind: "practice"; skillKey: string }
    | null
}

const STATUS_ICON: Record<RowStatus, string> = { covered: "✓", partial: "◐", missing: "✗" }

function kwInText(text: string, kw: string): boolean {
  if (kw.length <= 3) return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
  return text.toLowerCase().includes(kw.toLowerCase())
}

/** First visible bullet proving a keyword → "your <role> bullet at <company>". */
function proofFor(cv: CVStructured, hidden: Set<string>, kw: string): string | null {
  for (let ei = 0; ei < cv.experience.length; ei++) {
    const e = cv.experience[ei]
    for (let bi = 0; bi < e.bullets.length; bi++) {
      const b = e.bullets[bi]
      if (hidden.has(itemId("exp_bullet", ei * 100 + bi, b))) continue
      if (kwInText(b, kw)) return `your ${e.role} bullet${e.company ? ` at ${e.company}` : ""}`
    }
  }
  if (cv.skills_line && !hidden.has(itemId("skills_line", 0, cv.skills_line)) && kwInText(cv.skills_line, kw)) {
    return "your skills line"
  }
  return null
}

export function buildSkillRows(
  gapSkills: SkillGapItem[],
  plan: GapPlanResponse | null,
  targets: KeywordTarget[],
  fixes: V2Fix[],
  cv: CVStructured,
  hidden: Set<string>,
): SkillRow[] {
  const matched = new Set(targets.filter(t => t.matched).map(t => t.kw.toLowerCase()))
  const fixByKw = new Map<string, V2Fix>()
  for (const f of fixes) for (const k of f.keywords) {
    const key = k.toLowerCase()
    if (!fixByKw.has(key)) fixByKw.set(key, f)
  }
  const below = new Map(plan?.below_level_cards.map(c => [c.display_name.toLowerCase(), c]) ?? [])

  const rows = gapSkills.map((s): SkillRow => {
    const key = s.skill.toLowerCase()
    const fix = fixByKw.get(key)
    const bl = below.get(key)

    if (matched.has(key)) {
      const levelShort = s.user_level < s.required_level && s.user_level > 0
      const proof = proofFor(cv, hidden, s.skill)
      if (levelShort && bl) {
        return {
          name: s.skill, status: "partial",
          note: bl.host
            ? "On your CV, below the level this job asks. The Sharpen fix raises it."
            : "On your CV, below the level this job asks — practice to earn the level.",
          levelNote: `L${s.user_level} → L${s.required_level}`,
          action: fix ? { kind: "fix", fix } : { kind: "practice", skillKey: bl.skill },
        }
      }
      return {
        name: s.skill, status: "covered",
        note: proof ? `Proven by ${proof}.` : "Named on your CV.",
        levelNote: null, action: null,
      }
    }

    if (fix) {
      // Latent (you have it, the word never appears) or a sharpen host.
      return {
        name: s.skill, status: fix.kind === "Sharpen" ? "partial" : "missing",
        note: fix.kind === "Sharpen"
          ? "Your bullet proves it below the asked level — the Sharpen fix makes it count."
          : "You have it, but the word never appears on your CV. ATS can’t infer it.",
        levelNote: fix.levelNote ?? (s.required_level > 0 ? `asks L${s.required_level}` : null),
        action: { kind: "fix", fix },
      }
    }

    if (bl && !bl.host) {
      return {
        name: s.skill, status: "partial",
        note: "You’re building it — no bullet to sharpen yet. Practice to earn the level.",
        levelNote: `L${bl.current_level} → L${bl.required_level}`,
        action: { kind: "practice", skillKey: bl.skill },
      }
    }

    return {
      name: s.skill, status: "missing",
      note: "No bullet proves it. Add it from your real experience.",
      levelNote: s.required_level > 0 ? `asks L${s.required_level}` : null,
      action: { kind: "add" },
    }
  })

  const rank: Record<RowStatus, number> = { covered: 0, partial: 1, missing: 2 }
  return rows.sort((a, b) => rank[a.status] - rank[b.status])
}

interface SkillsRailProps {
  token: string
  rows: SkillRow[]
  coveredCount: number
  total: number
  onFix: (fix: V2Fix) => void
  onAdd: (skill: string) => void
}

export function SkillsRail({ token, rows, coveredCount, total, onFix, onAdd }: SkillsRailProps) {
  const [saved, setSaved] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    void usersApi.practiceSaves(token)
      .then(res => { if (alive) setSaved(new Set(res.skills.map(s => s.skill_key))) })
      .catch(() => {})
    return () => { alive = false }
  }, [token])

  function savePractice(skillKey: string, name: string) {
    if (saved.has(skillKey)) return
    setSaved(p => new Set(p).add(skillKey))
    void usersApi.savePracticeSkill(token, { skill_key: skillKey, display_name: name, source: "gap_session" })
      .catch(() => setSaved(p => { const n = new Set(p); n.delete(skillKey); return n }))
  }

  return (
    <div className="cvb-v2-railpane">
      <div className="cvb-v2-skillshead">
        <span className="cvb-v2-skillshead-title">Job requirements</span>
        <span className="cvb-v2-skillshead-count mono">
          <b>{coveredCount}</b> of {total} covered
        </span>
      </div>

      {rows.map(r => {
        const action = r.action
        return (
          <div key={r.name} className="cvb-v2-skillrow">
            <span className={`cvb-v2-skillicon ${r.status}`} aria-hidden>{STATUS_ICON[r.status]}</span>
            <div className="cvb-v2-skillbody">
              <div className="cvb-v2-skillname">
                {r.name}
                {r.levelNote && <span className="cvb-v2-skilllvl mono">{r.levelNote}</span>}
              </div>
              <div className="cvb-v2-skillnote">{r.note}</div>
            </div>
            {action?.kind === "fix" && (
              <button type="button" className="cvb-v2-skillact" onClick={() => onFix(action.fix)}>Fix it</button>
            )}
            {action?.kind === "add" && (
              <button type="button" className="cvb-v2-skillact" onClick={() => onAdd(r.name)}>Add it</button>
            )}
            {action?.kind === "practice" && (
              <Link
                href={`/forge?skill=${encodeURIComponent(action.skillKey)}`}
                target="_blank" rel="noopener noreferrer"
                className="cvb-v2-skillact"
                onClick={() => savePractice(action.skillKey, r.name)}
              >Practice</Link>
            )}
          </div>
        )
      })}

      {rows.length === 0 && (
        <div className="cvb-v2-skillempty mono">No requirements extracted for this job yet.</div>
      )}

      <p className="cvb-v2-rail-hintline">
        Chips on each bullet (left) show what it currently proves — matched chips are highlighted.
      </p>
    </div>
  )
}
