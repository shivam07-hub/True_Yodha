/**
 * RaiseItRail — Option C left column: ONE improvement worklist (backlog #34).
 *
 * The worklist is TYPE-TIERED into two buckets, RW-style:
 *   TOP FIXES — every open move, JD-gap tier first, then recruiter-check tier:
 *     · Add (latent)   — skill you've done but don't show → surface it on its bullet
 *     · Sharpen (shallow) — JD wants a higher level → surface one notch on its bullet
 *     · Practice (absent / no host) — no proof yet → save to Forge, earn it
 *     · Cut / Quantify / Fix — deterministic recruiter checks (runContentChecks):
 *       buzzwords, numberless bullets, weak openers, repeated phrases
 *   COMPLETED — JD moves that are done (keyword covered / saved).
 *
 * Every move carries "+N" — the deterministic readiness points it returns. JD
 * moves use the keyword-weight model; recruiter checks use the fixed per-category
 * penalty they subtract from Ready (#34 S3). Fixing either raises Ready by exactly
 * that much, and only when the CV text actually changes. All moves route the same
 * RewriteTarget to the CV editor (inline diff on the host bullet); the bullet also
 * gets a whole-bullet wash + issue chips from the same findings.
 */
"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { users as usersApi, type CVStructured, type GapPlanResponse } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import type { RewriteTarget } from "./cv-editor"
import type { KeywordTarget } from "./keyword-utils"
import {
  runContentChecks,
  contentFindingPoints,
  type ContentFinding,
  type ContentCheckKind,
} from "./content-checks"
import { CHECK_EXPLAINERS } from "./content-check-explainers"

interface RaiseItRailProps {
  token: string
  plan: GapPlanResponse | null
  cv: CVStructured
  targets: KeywordTarget[]
  pointsFor: (keywords: string[]) => number
  onRaise: (t: RewriteTarget) => void
}

type RailKind = "Add" | "Sharpen" | "Practice" | ContentCheckKind
interface RailRow {
  id: string
  skill: string
  kind: RailKind
  sub: string
  /** JD moves carry a real +N; recruiter-check moves have null (no fabricated gain). */
  gain: number | null
  keywords: string[]
  target: RewriteTarget | null
  skillKey: string | null
  /** 0 = JD-gap tier, 1 = recruiter-check tier. Sort key within TOP FIXES. */
  tier: 0 | 1
  /** Present on recruiter-check rows — drives the "why" explainer. */
  finding?: ContentFinding
}

function hostIid(section: string, itemIndex: number, bulletIndex: number, text: string): string {
  const kind = section.toLowerCase().startsWith("proj") ? "proj_bullet" : "exp_bullet"
  return itemId(kind, itemIndex * 100 + bulletIndex, text)
}

function buildGapRows(plan: GapPlanResponse, pointsFor: (k: string[]) => number): RailRow[] {
  const rows: RailRow[] = []
  plan.host_bullet_cards.forEach(c => {
    const keywords = c.skills.map(s => s.display_name)
    rows.push({
      id: `latent-${c.order}`, skill: keywords.join(", "), kind: "Add",
      sub: "missing from CV", gain: pointsFor(keywords), keywords,
      target: { iid: hostIid(c.section, c.item_index, c.bullet_index, c.bullet_text), keywords },
      skillKey: null, tier: 0,
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
        skillKey: c.skill, tier: 0,
      })
    } else {
      rows.push({
        id: `practice-${c.skill}`, skill: c.display_name, kind: "Practice",
        sub: "no proof yet · Forge", gain: pointsFor(keywords), keywords,
        target: null, skillKey: c.skill, tier: 0,
      })
    }
  })
  plan.absent_skills.forEach(a => {
    rows.push({
      id: `absent-${a.skill}`, skill: a.display_name, kind: "Practice",
      sub: a.is_primary ? "primary requirement · Forge" : "no proof yet · Forge",
      gain: pointsFor([a.display_name]), keywords: [a.display_name],
      target: null, skillKey: a.skill, tier: 0,
    })
  })
  return rows
}

/** Resolve the bullet text a finding points at, so we can rebuild its editor iid. */
function findingBulletText(cv: CVStructured, f: ContentFinding): string | null {
  if (f.section === "summary") return cv.summary
  if (f.section === "experience") return cv.experience[f.itemIndex]?.bullets[f.bulletIndex] ?? null
  if (f.section === "projects") return cv.projects[f.itemIndex]?.bullets[f.bulletIndex] ?? null
  return null
}

function findingIid(cv: CVStructured, f: ContentFinding): string | null {
  const text = findingBulletText(cv, f)
  if (text == null) return null
  if (f.section === "summary") return itemId("summary", 0, text)
  const kind = f.section === "projects" ? "proj_bullet" : "exp_bullet"
  return itemId(kind, f.itemIndex * 100 + f.bulletIndex, text)
}

/** Recruiter-check findings → rail rows (tier 1). The offenders become the
 *  rewrite keywords so the inline diff knows what to target; "+N" is the real
 *  readiness points the fix returns (#34 S3, contentFindingPoints). */
function buildContentRows(cv: CVStructured, findings: ContentFinding[]): RailRow[] {
  return findings.map(f => {
    const iid = findingIid(cv, f)
    const where =
      f.section === "summary" ? "summary" : f.section === "projects" ? "project" : "experience"
    return {
      id: f.id,
      skill: f.detail,
      kind: f.kind,
      sub: `${where} · ${CHECK_EXPLAINERS[f.category].title.replace(/^Why /, "")}`,
      gain: contentFindingPoints(f),
      keywords: f.offenders,
      target: iid ? { iid, keywords: f.offenders } : null,
      skillKey: null,
      tier: 1,
      finding: f,
    }
  })
}

export function RaiseItRail({ token, plan, cv, targets, pointsFor, onRaise }: RaiseItRailProps) {
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [openWhy, setOpenWhy] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    void usersApi.practiceSaves(token)
      .then(res => { if (alive) setSaved(new Set(res.skills.map(s => s.skill_key))) })
      .catch(() => {})
    return () => { alive = false }
  }, [token])

  // Recruiter-check rows recompute from the live CV — a fix vanishes the instant
  // the text no longer triggers it (the honest flywheel; S3 adds the score move).
  const contentRows = useMemo(() => buildContentRows(cv, runContentChecks(cv)), [cv])
  const rows = useMemo(
    () => [...(plan ? buildGapRows(plan, pointsFor) : []), ...contentRows],
    [plan, pointsFor, contentRows],
  )
  const matched = new Set(targets.filter(t => t.matched).map(t => t.kw.toLowerCase()))
  const isCovered = (kw: string[]) => kw.length > 0 && kw.every(k => matched.has(k.toLowerCase()))

  function rowDone(r: RailRow): boolean {
    if (r.tier === 1) return false // recruiter-check rows vanish when resolved; never "done" in place (S3)
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

  // TOP FIXES = open moves, JD tier before recruiter tier, +N desc within tier
  // (a null-gain recruiter row sorts after any numbered gap in its tier).
  const topFixes = rows
    .filter(r => !rowDone(r))
    .sort((a, b) => a.tier - b.tier || (b.gain ?? -1) - (a.gain ?? -1))
  const completed = rows.filter(rowDone)
  const allDone = rows.length > 0 && topFixes.length === 0

  function toggleWhy(id: string) {
    setOpenWhy(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function renderRow(r: RailRow, done: boolean) {
    const verb = r.kind === "Practice" ? "Practiced" : r.kind === "Add" ? "Added" : "Sharpened"
    const why = r.finding ? CHECK_EXPLAINERS[r.finding.category] : null
    return (
      <div key={r.id} className={`cvb-pgc-fix${done ? " done" : ""}`}>
        <div className="cvb-pgc-fix-row">
          <div className="cvb-pgc-fix-body">
            <div className="cvb-pgc-fix-skill">{r.skill}</div>
            <div className="mono cvb-pgc-fix-sub">
              {r.sub}
              {why && (
                <button type="button" className="cvb-pgc-fix-why" onClick={() => toggleWhy(r.id)}
                  aria-expanded={openWhy.has(r.id)}>
                  {openWhy.has(r.id) ? "hide why" : "why"}
                </button>
              )}
            </div>
          </div>
          {/* Every open move shows the real points it returns (#34 S3). */}
          <span className="mono cvb-pgc-fix-gain">{done ? "✓" : r.gain != null ? `+${r.gain}` : ""}</span>
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
        {why && openWhy.has(r.id) && (
          <ul className="cvb-pgc-fix-whybody">
            {why.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="cvb-pgc-rail">
      <div className="cvb-pgc-rail-head">
        <span className="cvb-pgc-eyebrow">Raise it</span>
        <span className="mono cvb-pgc-rail-count">{completed.length} done · {topFixes.length} left</span>
      </div>

      <div className="cvb-pgc-fixes">
        {topFixes.length > 0 && <div className="cvb-pgc-fix-group mono">TOP FIXES</div>}
        {topFixes.map(r => renderRow(r, false))}

        {completed.length > 0 && <div className="cvb-pgc-fix-group mono">COMPLETED</div>}
        {completed.map(r => renderRow(r, true))}

        {rows.length === 0 && (
          <div className="cvb-pgc-fix-empty mono">No gaps — your CV already speaks this role.</div>
        )}
      </div>

      {rows.length > 0 && (
        <div className={`cvb-pgc-done-chip${allDone ? " all" : ""}`}>
          <span className="mono">{allDone ? "✓" : "○"}</span>
          <span>{allDone ? "Ready to apply — all fixes cleared." : `Clear all ${topFixes.length} and you're application-ready.`}</span>
        </div>
      )}

      <div className="cvb-pgc-rail-hint">
        Hover any line on the right to <b>copy</b>, rewrite, edit or hide it. Copy drops the exact text into a company career-page form.
      </div>
    </div>
  )
}
