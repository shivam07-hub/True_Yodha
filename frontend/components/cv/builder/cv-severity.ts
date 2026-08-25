/**
 * cv-severity — the one severity axis the CV workstation ranks by.
 *
 * The hierarchy redesign (handoff "CV Playground — hierarchy", 2a) puts every
 * element in exactly one of four visual ranks, and rank 1/3 both key off ONE
 * question: how badly does this cost the user. Before this file, the surface
 * had four fix *kinds* (Quantify / Verb / Cut / Fix) and a points `gain`, but
 * no severity — so the rail sorted by points and the CV pane washed every
 * flagged line the same amber. Kind says what to do; severity says what to do
 * FIRST. They are different axes and the design needs the second one.
 *
 * Mapping is derived from the approved screen, not invented:
 *   blocking — a recruiter/ATS stops here. Unquantified bullets ("Put a number
 *              on this line") and any FAILING required ATS check ("Summary is
 *              empty · ats · section headings").
 *   weak     — reads soft, still readable. Weak openers, buzzwords, repetition.
 *   optional — a nudge with no cost. Optional ATS checks (phone), section
 *              invitations ("Add a certification section").
 *
 * The green "on-target" tone is a POSITIVE claim, so it needs positive
 * evidence: zero open findings AND the line carries scale (a number, currency,
 * percent or magnitude word). Off a job we do not say "on target" — there is no
 * target to be on — so the verdict word changes while the rule does not.
 */
import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import type { AtsCheck } from "./ats-checks"
import {
  hasQuantity,
  type ContentCategory,
  type ContentFinding,
} from "./content-checks"

export type Severity = "blocking" | "weak" | "optional"
/** Row tone in the CV pane: a severity, a positive verdict, or nothing to say. */
export type LineTone = Severity | "on-target"

export const SEVERITY_ORDER: readonly Severity[] = ["blocking", "weak", "optional"]

const CATEGORY_SEVERITY: Record<ContentCategory, Severity> = {
  unquantified: "blocking",
  "weak-verb": "weak",
  buzzword: "weak",
  repetition: "weak",
}

export function findingSeverity(f: ContentFinding): Severity {
  return CATEGORY_SEVERITY[f.category]
}

/** A failing required check blocks; an optional one only invites. Passing
 *  checks never reach here — they collapse into the rail's green strip. */
export function atsSeverity(check: AtsCheck): Severity {
  return check.optional ? "optional" : "blocking"
}

/** Worst-first, so a line with one blocking and two weak findings reads red. */
export function worstSeverity(list: readonly Severity[]): Severity | null {
  for (const s of SEVERITY_ORDER) if (list.includes(s)) return s
  return null
}

export interface LineVerdict {
  tone: LineTone
  /** Open findings on this line. 0 when the tone is "on-target". */
  count: number
  /** Verbatim phrases to underline inside the bullet. Empty for unquantified
   *  (nothing in the text is the offender — what's missing is). */
  offenders: string[]
}

export interface LineVerdictOpts {
  /** Fix ids the user dismissed — their finding stops marking the line, the
   *  same way it stops appearing in the rail. Id parity: finding.id === fix.id. */
  dismissed?: Set<string>
}

/**
 * Every CV line's tone, keyed by editor iid, derived from the SINGLE scan in
 * useCvDiagnosis — a line drops its gutter the moment its text stops triggering
 * the check, without a second pass over the CV.
 *
 * Only experience/project bullets can be "on-target": the summary is exempt
 * from the quantify rule, so a clean summary raises no finding and would
 * otherwise claim a target it was never measured against.
 */
export function lineVerdicts(
  cv: CVStructured,
  hidden: Set<string>,
  findings: readonly ContentFinding[],
  opts: LineVerdictOpts = {},
): Map<string, LineVerdict> {
  const bySeverity = new Map<string, { severities: Severity[]; offenders: string[] }>()
  for (const f of findings) {
    if (opts.dismissed?.has(f.id)) continue
    const iid = findingIid(cv, f)
    if (!iid) continue
    const entry = bySeverity.get(iid) ?? { severities: [], offenders: [] }
    entry.severities.push(findingSeverity(f))
    entry.offenders.push(...f.offenders)
    bySeverity.set(iid, entry)
  }

  const out = new Map<string, LineVerdict>()
  const claim = (iid: string, text: string, quantifiable: boolean) => {
    if (hidden.has(iid)) return
    const flagged = bySeverity.get(iid)
    if (flagged) {
      const tone = worstSeverity(flagged.severities)
      if (tone) out.set(iid, { tone, count: flagged.severities.length, offenders: flagged.offenders })
      return
    }
    if (quantifiable && hasQuantity(text)) {
      out.set(iid, { tone: "on-target", count: 0, offenders: [] })
    }
  }

  if (cv.summary?.trim()) claim(itemId("summary", 0, cv.summary), cv.summary, false)
  cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
    if (b.trim()) claim(itemId("exp_bullet", ei * 100 + bi, b), b, true)
  }))
  cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
    if (b.trim()) claim(itemId("proj_bullet", pi * 100 + bi, b), b, true)
  }))
  return out
}

/** Column-3 verdict text. `targeted` = a job is in play, so "on target" means
 *  something; off a job the same line is just strong. */
export function verdictLabel(v: LineVerdict, targeted: boolean): string {
  if (v.tone === "on-target") return targeted ? "on target" : "strong"
  return v.count === 1 ? "fix ›" : `${v.count} fixes`
}

/** Mobile verdict — the phone shows severity in words because the 3px gutter
 *  is doing less work at that size (handoff 1f). */
export function verdictLabelDense(v: LineVerdict, targeted: boolean): string {
  if (v.tone === "on-target") return targeted ? "✓ on target" : "✓ strong"
  return `${v.count} fix · ${v.tone}`
}

function findingIid(cv: CVStructured, f: ContentFinding): string | null {
  if (f.section === "summary") {
    return cv.summary ? itemId("summary", 0, cv.summary) : null
  }
  if (f.section === "experience") {
    const b = cv.experience[f.itemIndex]?.bullets[f.bulletIndex]
    return b == null ? null : itemId("exp_bullet", f.itemIndex * 100 + f.bulletIndex, b)
  }
  if (f.section === "projects") {
    const b = cv.projects[f.itemIndex]?.bullets[f.bulletIndex]
    return b == null ? null : itemId("proj_bullet", f.itemIndex * 100 + f.bulletIndex, b)
  }
  return null
}
