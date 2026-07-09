/**
 * fix-model — the CV Playground v2 unified fix list (one card per bullet issue).
 *
 * Merges the two honest fix sources into the shape the Fixes rail renders:
 *   · JD gaps (gap plan): Surface skill (latent — you did it, the word never
 *     appears) and Sharpen (below the level this job asks — carries L{cur}→L{req},
 *     the levelled-skill nuance).
 *   · Recruiter checks (runContentChecks): Quantify / Verb-opener / Cut / Fix —
 *     deterministic, anchored to the exact bullet.
 *
 * Every fix names its host bullet (editor iid) so a card click can jump to and
 * pulse the line, and carries the exact readiness points the fix returns — the
 * same deterministic math Ready uses, so "+N" promised is +N delivered.
 * Practice-only gaps (no proof yet) are NOT fixes — they live on the Skills tab
 * and route to Forge.
 */
import type { CVStructured, GapPlanResponse } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import {
  contentFindingPoints,
  runContentChecks,
  type ContentCategory,
  type ContentFinding,
} from "./content-checks"

export type V2FixKind = "Surface skill" | "Sharpen" | "Quantify" | "Verb" | "Cut" | "Fix"

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
  /** Skill keyword(s) the rewrite should weave in (empty for recruiter checks
   *  that only rephrase). */
  keywords: string[]
  /** Sharpen only — "L2 → L4", the level this job asks for (levelled skills). */
  levelNote?: string
  /** JD-gap tier sorts before recruiter-check tier. */
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

export function hostIid(section: string, itemIndex: number, bulletIndex: number, text: string): string {
  const kind = section.toLowerCase().startsWith("proj") ? "proj_bullet" : "exp_bullet"
  return itemId(kind, itemIndex * 100 + bulletIndex, text)
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
  plan: GapPlanResponse | null,
  pointsFor: (keywords: string[]) => number,
): V2Fix[] {
  const fixes: V2Fix[] = []

  if (plan) {
    plan.host_bullet_cards.forEach(c => {
      const keywords = c.skills.map(s => s.display_name)
      fixes.push({
        id: `surface-${c.order}`,
        kind: "Surface skill",
        title: `Surface ${quote(keywords.join(", "))} — the job asks for it and you have it`,
        desc: "This bullet proves it, but the word never appears. ATS can’t infer it.",
        gain: pointsFor(keywords),
        iid: hostIid(c.section, c.item_index, c.bullet_index, c.bullet_text),
        bulletText: c.bullet_text,
        keywords,
        tier: 0,
      })
    })
    plan.below_level_cards.forEach(c => {
      if (!c.host) return // practice-only — Skills tab routes it to Forge
      fixes.push({
        id: `sharpen-${c.skill}`,
        kind: "Sharpen",
        title: `Raise ${c.display_name} to L${c.required_level}`,
        desc: `Your bullet reads L${c.current_level}. Phrase the depth this job asks for — same facts, full weight.`,
        gain: pointsFor([c.display_name]),
        iid: hostIid(c.host.section, c.host.item_index, c.host.bullet_index, c.host.bullet_text),
        bulletText: c.host.bullet_text,
        keywords: [c.display_name],
        levelNote: `L${c.current_level} → L${c.required_level}`,
        tier: 0,
      })
    })
  }

  for (const f of runContentChecks(cv)) {
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

  // JD tier first, then biggest gain first within each tier.
  return fixes.sort((a, b) => a.tier - b.tier || b.gain - a.gain)
}
