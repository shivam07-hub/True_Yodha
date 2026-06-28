/**
 * RaiseItRail — Option C left column: the job's gaps as a prioritized worklist.
 *
 * Each gap is one honest move (gap-driven rewrite, GRILL-LOCKED):
 *   • Add (latent)   — skill you've done but don't show → surface it on its bullet
 *   • Sharpen (shallow) — JD wants a higher level → surface one notch on its bullet
 *   • Practice (absent / no host) — no proof yet → save to Forge, earn it
 * Add / Sharpen hand a RewriteTarget to the CV editor (inline diff on the host
 * bullet). Practice saves to the Forge queue + opens it. "+N" is the deterministic
 * readiness gain from the same keyword-weight model that drives the Ready score —
 * a row reads "done" once its keyword is covered (Add/Sharpen) or saved (Practice).
 */
"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { users as usersApi, type GapPlanResponse } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import type { RewriteTarget } from "./cv-editor"
import type { KeywordTarget } from "./keyword-utils"

interface RaiseItRailProps {
  token: string
  plan: GapPlanResponse | null
  targets: KeywordTarget[]
  pointsFor: (keywords: string[]) => number
  onRaise: (t: RewriteTarget) => void
}

type RailKind = "Add" | "Sharpen" | "Practice"
interface RailRow {
  id: string
  skill: string
  kind: RailKind
  sub: string
  gain: number
  keywords: string[]
  target: RewriteTarget | null
  skillKey: string | null
}

function hostIid(section: string, itemIndex: number, bulletIndex: number, text: string): string {
  const kind = section.toLowerCase().startsWith("proj") ? "proj_bullet" : "exp_bullet"
  return itemId(kind, itemIndex * 100 + bulletIndex, text)
}

function buildRows(plan: GapPlanResponse, pointsFor: (k: string[]) => number): RailRow[] {
  const rows: RailRow[] = []
  plan.host_bullet_cards.forEach(c => {
    const keywords = c.skills.map(s => s.display_name)
    rows.push({
      id: `latent-${c.order}`, skill: keywords.join(", "), kind: "Add",
      sub: "missing from CV", gain: pointsFor(keywords), keywords,
      target: { iid: hostIid(c.section, c.item_index, c.bullet_index, c.bullet_text), keywords },
      skillKey: null,
    })
  })
  plan.below_level_cards.forEach(c => {
    const keywords = [c.display_name]
    if (c.host) {
      rows.push({
        id: `shallow-${c.skill}`, skill: c.display_name, kind: "Sharpen",
        sub: `L${c.current_level} → L${c.required_level} · weak phrasing`,
        gain: pointsFor(keywords), keywords,
        target: { iid: hostIid(c.host.section, c.host.item_index, c.host.bullet_index, c.host.bullet_text), keywords },
        skillKey: c.skill,
      })
    } else {
      rows.push({
        id: `practice-${c.skill}`, skill: c.display_name, kind: "Practice",
        sub: "no proof yet · Forge", gain: pointsFor(keywords), keywords,
        target: null, skillKey: c.skill,
      })
    }
  })
  plan.absent_skills.forEach(a => {
    rows.push({
      id: `absent-${a.skill}`, skill: a.display_name, kind: "Practice",
      sub: a.is_primary ? "primary requirement · Forge" : "no proof yet · Forge",
      gain: pointsFor([a.display_name]), keywords: [a.display_name],
      target: null, skillKey: a.skill,
    })
  })
  // Highest readiness gain first — the worklist mirrors the score lever.
  return rows.sort((a, b) => b.gain - a.gain)
}

export function RaiseItRail({ token, plan, targets, pointsFor, onRaise }: RaiseItRailProps) {
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    void usersApi.practiceSaves(token)
      .then(res => { if (alive) setSaved(new Set(res.skills.map(s => s.skill_key))) })
      .catch(() => {})
    return () => { alive = false }
  }, [token])

  const rows = plan ? buildRows(plan, pointsFor) : []
  const matched = new Set(targets.filter(t => t.matched).map(t => t.kw.toLowerCase()))
  const isCovered = (kw: string[]) => kw.length > 0 && kw.every(k => matched.has(k.toLowerCase()))

  function rowDone(r: RailRow): boolean {
    if (r.kind === "Practice") return r.skillKey ? saved.has(r.skillKey) : false
    return isCovered(r.keywords)
  }

  async function savePractice(r: RailRow) {
    if (!r.skillKey || busy.has(r.skillKey)) return
    setBusy(p => new Set(p).add(r.skillKey!))
    setSaved(p => new Set(p).add(r.skillKey!))
    try {
      await usersApi.savePracticeSkill(token, { skill_key: r.skillKey, display_name: r.skill, source: "gap_session" })
    } catch {
      setSaved(p => { const n = new Set(p); n.delete(r.skillKey!); return n })
    } finally {
      setBusy(p => { const n = new Set(p); n.delete(r.skillKey!); return n })
    }
  }

  const openCount = rows.filter(r => !rowDone(r)).length
  const clearedCount = rows.length - openCount
  const allDone = rows.length > 0 && openCount === 0

  return (
    <div className="cvb-pgc-rail">
      <div className="cvb-pgc-rail-head">
        <span className="cvb-pgc-eyebrow">Raise it</span>
        <span className="mono cvb-pgc-rail-count">{clearedCount} done · {openCount} left</span>
      </div>

      <div className="cvb-pgc-fixes">
        {rows.map(r => {
          const done = rowDone(r)
          const verb = r.kind === "Practice" ? "Practiced" : r.kind === "Add" ? "Added" : "Sharpened"
          return (
            <div key={r.id} className={`cvb-pgc-fix${done ? " done" : ""}`}>
              <div className="cvb-pgc-fix-body">
                <div className="cvb-pgc-fix-skill">{r.skill}</div>
                <div className="mono cvb-pgc-fix-sub">{r.sub}</div>
              </div>
              <span className="mono cvb-pgc-fix-gain">{done ? "✓" : `+${r.gain}`}</span>
              {done ? (
                <span className="cvb-pgc-fix-btn done">{verb}</span>
              ) : r.kind === "Practice" ? (
                <Link
                  href={`/forge?skill=${encodeURIComponent(r.skillKey ?? "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="cvb-pgc-fix-btn"
                  onClick={() => void savePractice(r)}
                >Practice</Link>
              ) : (
                <button
                  type="button"
                  className="cvb-pgc-fix-btn"
                  onClick={() => r.target && onRaise(r.target)}
                >{r.kind}</button>
              )}
            </div>
          )
        })}
        {rows.length === 0 && (
          <div className="cvb-pgc-fix-empty mono">No gaps — your CV already speaks this role.</div>
        )}
      </div>

      {rows.length > 0 && (
        <div className={`cvb-pgc-done-chip${allDone ? " all" : ""}`}>
          <span className="mono">{allDone ? "✓" : "○"}</span>
          <span>{allDone ? "Ready to apply — all fixes cleared." : `Clear all ${rows.length} and you're application-ready.`}</span>
        </div>
      )}

      <div className="cvb-pgc-rail-hint">
        Hover any line on the right to <b>copy</b>, rewrite, edit or hide it. Copy drops the exact text into a company career-page form.
      </div>
    </div>
  )
}
