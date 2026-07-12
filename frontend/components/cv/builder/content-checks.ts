/**
 * content-checks — deterministic, zero-LLM, zero-cost content quality scan of a CV.
 *
 * This is the ENGINE behind the "Raise it" report's recruiter-check moves (Cut /
 * Quantify / Fix). It runs synchronously on the live composed CV so the ledger
 * counts, the whole-bullet washes, and the honest score flywheel all read from
 * one deterministic source — never an LLM, never a coin charge to *see* a problem.
 * The FIX (rewriting a flagged bullet) is where the LLM earns its place, via the
 * existing RAG-grounded bullet-rewrite path (backlog #26/#32) — this module only
 * FINDS, it never rewrites.
 *
 * Findings map 1:1 onto rail rows and onto a bullet locator so a click can wash +
 * scroll to the offending line. A finding auto-clears when the live text no longer
 * triggers it (the honest flywheel, grill Q7) — so every rule here is a pure
 * function of the current CV text.
 */
import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { BUZZWORDS, WEAK_OPENERS } from "./cv-buzzwords"

export type ContentCheckKind = "Cut" | "Quantify" | "Fix"
export type ContentCategory = "buzzword" | "unquantified" | "repetition" | "weak-verb"

/** Where a finding lives in the CV. `itemIndex`/`bulletIndex` are -1 for the
 *  single summary / skills blocks (no per-bullet grain). */
export interface ContentBulletRef {
  section: "summary" | "experience" | "projects" | "skills"
  itemIndex: number
  bulletIndex: number
}

export interface ContentFinding extends ContentBulletRef {
  /** Stable id — same input text ⇒ same id, so React keys + "done" state hold. */
  id: string
  kind: ContentCheckKind
  category: ContentCategory
  /** Offending substrings, named verbatim in the issue chips. */
  offenders: string[]
  /** One-line row summary. */
  detail: string
}

/** Per-category rollup for the ledger's TOP FIXES buckets (name + count). */
export interface ContentCheckSummary {
  category: ContentCategory
  kind: ContentCheckKind
  label: string
  count: number
}

const CATEGORY_META: Record<ContentCategory, { kind: ContentCheckKind; label: string }> = {
  buzzword: { kind: "Cut", label: "Buzzwords & clichés" },
  "weak-verb": { kind: "Fix", label: "Weak openers" },
  unquantified: { kind: "Quantify", label: "Unquantified impact" },
  repetition: { kind: "Fix", label: "Repeated phrases" },
}

/**
 * Readiness points each open finding costs — the honest flywheel weight (#34 S3).
 * A transparent per-category rule (like the keyword is_primary=3/else=2 weights),
 * NOT a per-instance fabrication. Ready subtracts these; fixing a finding removes
 * it on re-scan, so the exact points return — the number moves only when the text
 * actually changes. Quantification is the highest-signal recruiter check, so it
 * carries the most weight.
 */
const CATEGORY_PENALTY: Record<ContentCategory, number> = {
  unquantified: 3,
  buzzword: 2,
  "weak-verb": 2,
  repetition: 2,
}

/** Readiness points a single fix returns. */
export function contentFindingPoints(f: ContentFinding): number {
  return CATEGORY_PENALTY[f.category]
}

/** Total readiness Ready loses to open content findings — subtracted from the
 *  keyword-match Ready so a clean CV scores higher than a buzzword-heavy one. */
export function contentPenalty(findings: ContentFinding[]): number {
  return findings.reduce((sum, f) => sum + CATEGORY_PENALTY[f.category], 0)
}

function refId(ref: ContentBulletRef): string {
  return `${ref.section}:${ref.itemIndex}:${ref.bulletIndex}`
}

// ─── individual rules (each a pure fn of text) ────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Case-insensitive, word-boundary-aware phrase hits from a fixed vocabulary. */
function phraseHits(text: string, vocab: readonly string[]): string[] {
  const lower = text.toLowerCase()
  const hits: string[] = []
  for (const phrase of vocab) {
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i")
    if (re.test(lower)) hits.push(phrase)
  }
  return hits
}

/** A bullet quantifies impact if it contains a number, percent, currency, or a
 *  magnitude word. Deliberately generous — we only flag the CLEARLY numberless. */
const QUANTITY_RE = /(\d|[%$€£₹]|\b(?:thousands?|millions?|billions?|lakhs?|crores?|dozens?|hundreds?)\b)/i

function isUnquantified(text: string): boolean {
  return text.trim().length > 0 && !QUANTITY_RE.test(text)
}

/** Weak opener = the bullet leads with a duty phrase, after stripping bullet
 *  glyphs / whitespace. Returns the matched opener or null. */
function weakOpener(text: string): string | null {
  const t = text.replace(/^[\s•\-–*·]+/, "").toLowerCase()
  for (const opener of WEAK_OPENERS) {
    if (t.startsWith(opener + " ") || t === opener) return opener
  }
  return null
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "a", "an", "to",
  "of", "in", "on", "at", "by", "as", "is", "are", "was", "were", "be", "or",
])

/** Content trigrams (3 consecutive non-trivial words) of a bullet, lower-cased. */
function trigrams(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  const grams: string[] = []
  for (let i = 0; i + 2 < words.length; i++) {
    const g = [words[i], words[i + 1], words[i + 2]]
    // skip grams that are all stop words (noise like "as per the")
    if (g.every(w => STOP_WORDS.has(w))) continue
    grams.push(g.join(" "))
  }
  return grams
}

// ─── the scan ─────────────────────────────────────────────────────────────────

interface BulletUnit extends ContentBulletRef {
  text: string
}

/** Editor row id of a scannable unit — the same identity the playground's
 *  hidden set and jump anchors use, computed from FULL-CV indices. */
export function unitIid(u: ContentBulletRef & { text: string }): string {
  if (u.section === "summary") return itemId("summary", 0, u.text)
  const kind = u.section === "projects" ? "proj_bullet" : "exp_bullet"
  return itemId(kind, u.itemIndex * 100 + u.bulletIndex, u.text)
}

/** Flatten every scannable text region into addressable units. Summary + skills
 *  are single blocks (bulletIndex -1); experience/projects are per-bullet.
 *  Units keep their full-CV indices, so filtering hidden ones never shifts a ref. */
function collectUnits(cv: CVStructured, hiddenIids?: Set<string>): BulletUnit[] {
  const units: BulletUnit[] = []
  if (cv.summary?.trim()) {
    units.push({ section: "summary", itemIndex: -1, bulletIndex: -1, text: cv.summary })
  }
  cv.experience.forEach((exp, i) => {
    exp.bullets.forEach((b, j) => {
      if (b.trim()) units.push({ section: "experience", itemIndex: i, bulletIndex: j, text: b })
    })
  })
  cv.projects.forEach((proj, i) => {
    proj.bullets.forEach((b, j) => {
      if (b.trim()) units.push({ section: "projects", itemIndex: i, bulletIndex: j, text: b })
    })
  })
  if (!hiddenIids?.size) return units
  return units.filter(u => !hiddenIids.has(unitIid(u)))
}

/**
 * Run every deterministic content check over the CV. Returns a flat, stable list
 * of findings. Pure — same CV in ⇒ same findings out (so the flywheel can diff).
 *
 * `hiddenIids` (the playground's deselected lines, by editor iid) drops those
 * units BEFORE any rule runs, so a hidden bullet neither raises findings nor
 * counts as the second leg of a repetition pair — what isn't on the CV can't
 * cost points or demand a fix.
 */
export function runContentChecks(cv: CVStructured, hiddenIids?: Set<string>): ContentFinding[] {
  const units = collectUnits(cv, hiddenIids)
  const findings: ContentFinding[] = []

  // buzzwords — summary + every experience/project bullet
  for (const u of units) {
    const hits = phraseHits(u.text, BUZZWORDS)
    if (hits.length > 0) {
      findings.push({
        ...u,
        id: `buzzword:${refId(u)}`,
        kind: "Cut",
        category: "buzzword",
        offenders: hits,
        detail: hits.length === 1 ? `Cut "${hits[0]}"` : `Cut ${hits.length} clichés`,
      })
    }
  }

  // weak openers — experience/project bullets only (a summary isn't a bullet)
  for (const u of units) {
    if (u.section === "summary") continue
    const opener = weakOpener(u.text)
    if (opener) {
      findings.push({
        ...u,
        id: `weak-verb:${refId(u)}`,
        kind: "Fix",
        category: "weak-verb",
        offenders: [opener],
        detail: `Lead with an achievement, not "${opener}"`,
      })
    }
  }

  // unquantified — experience/project bullets only
  for (const u of units) {
    if (u.section === "summary") continue
    if (isUnquantified(u.text)) {
      findings.push({
        ...u,
        id: `unquantified:${refId(u)}`,
        kind: "Quantify",
        category: "unquantified",
        offenders: [],
        detail: "Add a number to show scale",
      })
    }
  }

  // repetition — any content trigram appearing in ≥2 distinct bullets
  const gramToRefs = new Map<string, BulletUnit[]>()
  for (const u of units) {
    const seen = new Set<string>()
    for (const g of trigrams(u.text)) {
      if (seen.has(g)) continue // count a gram once per bullet
      seen.add(g)
      const arr = gramToRefs.get(g) ?? []
      arr.push(u)
      gramToRefs.set(g, arr)
    }
  }
  // a bullet gets at most one repetition finding, citing its most-shared phrase
  const repByRef = new Map<string, { unit: BulletUnit; phrase: string; times: number }>()
  for (const [gram, refs] of Array.from(gramToRefs.entries())) {
    if (refs.length < 2) continue
    for (const u of refs) {
      const key = refId(u)
      const existing = repByRef.get(key)
      if (!existing || refs.length > existing.times) {
        repByRef.set(key, { unit: u, phrase: gram, times: refs.length })
      }
    }
  }
  for (const { unit, phrase } of Array.from(repByRef.values())) {
    findings.push({
      ...unit,
      id: `repetition:${refId(unit)}`,
      kind: "Fix",
      category: "repetition",
      offenders: [phrase],
      detail: `Reword the repeated "${phrase}"`,
    })
  }

  return findings
}

/** Group findings into per-category ledger buckets (name + count), ordered by
 *  count desc — feeds the TOP FIXES section headers. */
export function summarizeContentChecks(findings: ContentFinding[]): ContentCheckSummary[] {
  const byCat = new Map<ContentCategory, number>()
  for (const f of findings) byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1)
  return Array.from(byCat.entries())
    .map(([category, count]) => ({
      category,
      count,
      kind: CATEGORY_META[category].kind,
      label: CATEGORY_META[category].label,
    }))
    .sort((a, b) => b.count - a.count)
}

/** All findings anchored to one bullet — the CV wash + issue-chips read this. */
export function findingsForBullet(
  findings: ContentFinding[],
  ref: ContentBulletRef,
): ContentFinding[] {
  return findings.filter(
    f => f.section === ref.section && f.itemIndex === ref.itemIndex && f.bulletIndex === ref.bulletIndex,
  )
}
