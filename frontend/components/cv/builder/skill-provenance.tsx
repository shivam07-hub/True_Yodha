/**
 * SkillProvenance — "where each skill comes from in your CV".
 *
 * The audit, homed under the Skills rail tab (its natural place — right where the
 * skills line is edited). Answers Shivam's ask: a skill extracted by Myro should
 * show WHICH CV point it came from. `evidence_text` is a verbatim slice of the
 * backing CV bullet (SE2 locator invariant), so grouping proven skills by their
 * evidence text reconstructs point → skills. Skills with no evidence are
 * keyword-inferred (no CV point yet) — surfaced separately as an honest gap.
 *
 * Read-only. Fed by the existing users.mySkills query — no new endpoint.
 */
"use client"

import { useMemo } from "react"
import type { UserSkillItem } from "@/lib/api"

interface PointGroup {
  evidence: string
  skills: UserSkillItem[]
  topLevel: number
}

export function SkillProvenance({ allSkills }: { allSkills: UserSkillItem[] }) {
  const { points, keywordOnly } = useMemo(() => {
    const byPoint = new Map<string, UserSkillItem[]>()
    const kw: UserSkillItem[] = []
    for (const s of allSkills) {
      const ev = (s.evidence_text ?? "").trim()
      if (!ev) { kw.push(s); continue }
      const arr = byPoint.get(ev)
      if (arr) arr.push(s)
      else byPoint.set(ev, [s])
    }
    const pts: PointGroup[] = Array.from(byPoint.entries()).map(([evidence, skills]) => ({
      evidence,
      skills: skills.slice().sort((a, b) => b.level - a.level),
      topLevel: Math.max(...skills.map((s) => s.level)),
    }))
    pts.sort((a, b) => b.topLevel - a.topLevel || b.skills.length - a.skills.length)
    kw.sort((a, b) => a.display_name.localeCompare(b.display_name))
    return { points: pts, keywordOnly: kw }
  }, [allSkills])

  if (allSkills.length === 0) {
    return <p className="cvb-prov-empty">Upload a CV to see where your skills come from.</p>
  }

  return (
    <div className="cvb-prov">
      <div className="cvb-prov-label">Where each skill comes from</div>

      {points.map((pt) => (
        <div key={pt.evidence} className="cvb-prov-point">
          <p className="cvb-prov-quote">{pt.evidence}</p>
          <div className="cvb-prov-chips">
            {pt.skills.map((s) => (
              <span key={s.key} className="cvb-prov-chip" title={s.proficiency_title || undefined}>
                {s.display_name}
                <em className="cvb-prov-lvl">L{s.level}</em>
              </span>
            ))}
          </div>
        </div>
      ))}

      {keywordOnly.length > 0 && (
        <div className="cvb-prov-gap">
          <div className="cvb-prov-gap-label">No CV point yet · {keywordOnly.length}</div>
          <p className="cvb-prov-gap-note">Keyword-inferred — add a line that shows these to log proof.</p>
          <div className="cvb-prov-chips">
            {keywordOnly.map((s) => (
              <span key={s.key} className="cvb-prov-chip weak">{s.display_name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
