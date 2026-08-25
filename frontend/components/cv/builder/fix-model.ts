/**
 * fix-model — the CV workstation's content-quality fixes (one per bullet issue).
 *
 * Content-quality fixes only (2026-07-18): Quantify / Verb-opener / Cut / Fix,
 * from runContentChecks — deterministic, anchored to the exact CV bullet, each
 * inline-rewritable and carrying the exact readiness points it returns (the same
 * math Ready uses, so "+N" promised is +N delivered).
 *
 * Hierarchy redesign (2026-08-25): each fix now also carries a `severity` and a
 * `provenance` string. Severity is the axis the rail RANKS by (blocking / weak /
 * optional) — kind says what to do, severity says what to do first, and the
 * triage numerals count the second one. Provenance is the rank-4 mono line under
 * the title ("capgemini · line 3"), so a rail row names the CV line it belongs
 * to without quoting it — the CV pane is the quote.
 *
 * JD-requirement work (weak → sharpen, gap → bank a story) does NOT live here.
 * It lives on the Skills tab, driven by jd_coverage (the JD's real requirements
 * matched against the user's stories + CV), and routes to Tailor with Mentor.
 */
import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import {
  contentFindingPoints,
  type ContentCategory,
  type ContentFinding,
} from "./content-checks"
import { findingSeverity, type Severity } from "./cv-severity"

export type V2FixKind = "Quantify" | "Verb" | "Cut" | "Fix"

export interface V2Fix {
  id: string
  kind: V2FixKind
  /** The check that raised this. Keys the authored explainer copy — the "why"
   *  a user can read for free, before deciding to spend a rewrite on it. */
  category: ContentCategory
  severity: Severity
  title: string
  /** Rank-4 provenance — the host line, e.g. "capgemini · line 3". */
  provenance: string
  /** The offending phrases, verbatim from the line. Sent to the rewriter so it
   *  knows what to remove, and read back by fix-verify to check it did. */
  offenders: string[]
  /** Readiness points this fix returns — deterministic, never fabricated. */
  gain: number
  /** Host bullet: editor row id + its current text (the rewrite input). */
  iid: string
  bulletText: string
  /** Skill keyword(s) the rewrite should weave in — empty for content-quality
   *  checks, which only rephrase. */
  keywords: string[]
  tier: 0 | 1
}

/** A fix applied this session — drives the rail's applied count and the ✓ mark
 *  on the host bullet. */
export interface AppliedFix {
  id: string
  iid: string
  kind: V2FixKind
  title: string
  gain: number
}

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

/** Where this line lives, said the way a reader locates it on the page.
 *
 *  Every row names its OWN host, repetition included. The handoff labels the
 *  repetition row "across experience", and that reads well when one is drawn —
 *  but a phrase repeated in three lines raises three rows, and three rows with
 *  the same title AND the same provenance are indistinguishable: the user
 *  cannot tell which line each one opens. The title already carries the scope
 *  ("repeats in 3 lines"); provenance is the only thing left to say WHICH. */
function findingProvenance(cv: CVStructured, f: ContentFinding): string {
  if (f.section === "summary") return "summary"
  if (f.section === "projects") {
    const p = cv.projects[f.itemIndex]
    return [p?.name, `line ${f.bulletIndex + 1}`].filter(Boolean).join(" · ")
  }
  const e = cv.experience[f.itemIndex]
  const where = e?.company?.trim() || e?.role?.trim() || "experience"
  return `${where} · line ${f.bulletIndex + 1}`
}

const quote = (s: string) => `“${s}”`

/** The title only. It names the defect and quotes the offender back verbatim;
 *  WHY it costs is authored once per category in content-check-explainers and
 *  rendered by the brief, so a second sentence here would only restate it. */
function contentCard(f: ContentFinding): { kind: V2FixKind; title: string } {
  const first = f.offenders[0] ?? ""
  const map: Record<ContentCategory, { kind: V2FixKind; title: string }> = {
    unquantified: {
      kind: "Quantify",
      title: "Put a number on this line",
    },
    "weak-verb": {
      kind: "Verb",
      title: `${quote(first)} is a weak opener`,
    },
    buzzword: {
      kind: "Cut",
      title: `Cut ${quote(first)}`,
    },
    repetition: {
      kind: "Fix",
      title: `${quote(first)} repeats in ${f.occurrences ?? 2} lines`,
    },
  }
  return map[f.category]
}

/**
 * Findings in, fixes out. This deliberately does NOT scan: the CV is scanned
 * exactly once per change, in useCvDiagnosis, and every derived view reads that
 * one array. Four call sites used to each run their own full scan of the same
 * CV with the same inputs — 1.37ms and 6,480 throwaway RegExp objects per
 * keystroke on the autosaving master surface.
 */
export function buildFixes(
  cv: CVStructured,
  findings: readonly ContentFinding[],
): V2Fix[] {
  const fixes: V2Fix[] = []

  for (const f of findings) {
    const iid = findingIid(cv, f)
    const text = findingBulletText(cv, f)
    if (!iid || text == null) continue
    const card = contentCard(f)
    fixes.push({
      id: f.id,
      ...card,
      category: f.category,
      offenders: f.offenders,
      severity: findingSeverity(f),
      provenance: findingProvenance(cv, f),
      gain: contentFindingPoints(f),
      iid,
      bulletText: text,
      keywords: [],
      tier: 1,
    })
  }

  // Worst first, then biggest gain — the rail's order IS the triage.
  const rank: Record<Severity, number> = { blocking: 0, weak: 1, optional: 2 }
  return fixes.sort((a, b) => rank[a.severity] - rank[b.severity] || b.gain - a.gain)
}
