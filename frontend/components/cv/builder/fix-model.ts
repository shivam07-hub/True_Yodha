/**
 * fix-model — the CV Playground v2 Fixes list (one card per bullet issue).
 *
 * Content-quality fixes only (2026-07-18): Quantify / Verb-opener / Cut / Fix,
 * from runContentChecks — deterministic, anchored to the exact CV bullet, each
 * inline-rewritable and carrying the exact readiness points it returns (the same
 * math Ready uses, so "+N" promised is +N delivered).
 *
 * JD-requirement work (weak → sharpen, gap → bank a story) does NOT live here.
 * It lives on the Job-fit tab, driven by jd_coverage (the JD's real requirements
 * matched against the user's stories + CV), and routes to Tailor with Mentor.
 * The old taxonomy gap-plan fix cards (Surface skill / Sharpen from job_skills)
 * are gone — they scored keyword garbage on non-tech roles.
 */
import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import {
  contentFindingPoints,
  runContentChecks,
  type ContentCategory,
  type ContentFinding,
} from "./content-checks"

export type V2FixKind = "Quantify" | "Verb" | "Cut" | "Fix"

export interface V2Fix {
  id: string
  kind: V2FixKind
  title: string
  desc: string
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

/** A fix applied this session — drives the rail's Applied list and the ✓ +N
 *  mark on the host bullet. */
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

const quote = (s: string) => `“${s}”`

/** Card copy per recruiter-check category — title says the defect, desc says why
 *  it costs (recruiter's-eye, per content-check-explainers voice). */
function contentCard(f: ContentFinding): { kind: V2FixKind; title: string; desc: string } {
  const first = f.offenders[0] ?? ""
  const map: Record<ContentCategory, { kind: V2FixKind; title: string; desc: string }> = {
    unquantified: {
      kind: "Quantify",
      title: "Add a real number to this bullet",
      desc: "Recruiters scan for scale. This bullet describes the work but not the impact.",
    },
    "weak-verb": {
      kind: "Verb",
      title: `${quote(first)} is a weak opener`,
      desc: "Open with the action, not the assignment.",
    },
    buzzword: {
      kind: "Cut",
      title: `Cut ${quote(first)}`,
      desc: "Everyone claims it, so a recruiter reads past it — show the work instead.",
    },
    repetition: {
      kind: "Fix",
      title: `${quote(first)} repeats across bullets`,
      desc: "Vary the phrase — repetition dulls every use.",
    },
  }
  return map[f.category]
}

export function buildV2Fixes(
  cv: CVStructured,
  hiddenIids?: Set<string>,
): V2Fix[] {
  const fixes: V2Fix[] = []

  for (const f of runContentChecks(cv, hiddenIids)) {
    const iid = findingIid(cv, f)
    const text = findingBulletText(cv, f)
    if (!iid || text == null) continue
    const card = contentCard(f)
    fixes.push({
      id: f.id,
      ...card,
      gain: contentFindingPoints(f),
      iid,
      bulletText: text,
      keywords: [],
      tier: 1,
    })
  }

  // Biggest gain first.
  return fixes.sort((a, b) => b.gain - a.gain)
}
