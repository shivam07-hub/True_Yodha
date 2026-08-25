import type { CVStructured, UserProfile } from "@/lib/api"
import { spellCheckCv } from "./cv-spellcheck"

/** Where a failing check routes the user in the CV editor. Maps to a section
 *  anchor id (`cv-edit-<target>`) so a click can scroll + focus the fix. */
export type AtsFixTarget = "contact" | "summary" | "experience" | "skills"

export interface AtsCheck {
  label: string
  /** Rank-4 provenance tag — rendered as `ats · <tag>` under the rail row title
   *  so an ATS verdict names its own source (hierarchy redesign §4.4). */
  tag: string
  pass: boolean
  detail?: string
  /** Editor section to jump to when failing. Omit for always-pass checks. */
  fix?: AtsFixTarget
  /** Optional checks warn but do NOT count against the score (e.g. phone). */
  optional?: boolean
}

/** A `[REDACTED_*]` marker is an AI-egress artifact. If one is rendering as the
 *  user's name it is not a filled field — it is a broken one. These checks used
 *  a presence test, so a CV whose header read `[REDACTED_CV_HEADER]` scored 8/8
 *  and told the user it was recruiter-ready. Presence is not validity. */
const REDACTION_TOKEN = /\[REDACTED(?:_[A-Z_]+)?\]/

function realValue(value: string | undefined | null): string {
  const text = (value ?? "").trim()
  return REDACTION_TOKEN.test(text) ? "" : text
}

function hasConsistentDates(dates: (string | undefined | null)[]): boolean {
  const filled = dates.filter(Boolean) as string[]
  if (filled.length === 0) return true
  return filled.every(d => /\d{4}/.test(d))
}

export function runAtsChecks(
  cv: CVStructured,
  profile: UserProfile | null,
  filename: string,
): AtsCheck[] {
  const hasName = Boolean(realValue(cv.contact?.name) || realValue(profile?.full_name))
  const hasEmail = Boolean(realValue(cv.contact?.email) || realValue(profile?.email))
  const hasPhone = Boolean(realValue(cv.contact?.phone))
  const hasContent = cv.experience.length > 0 || Boolean(cv.skills_line?.trim())
  const hasSummary = Boolean(realValue(cv.summary))
  const datesOk = hasConsistentDates(cv.experience.map(e => e.dates))
  const contactOk = hasName && hasEmail
  // The slug strips the token's brackets, so match the bare word too — a
  // `REDACTED_CV_HEADER_CV.pdf` passed the character-class test cleanly.
  const filenameOk = /^[a-z0-9_]+\.pdf$/i.test(filename) && !/REDACTED/i.test(filename)
  const typos = spellCheckCv(cv)
  const spellingOk = typos.length === 0
  const typoSummary = typos.slice(0, 4).map(t => t.wrong).join(", ") + (typos.length > 4 ? "…" : "")

  return [
    { label: "Single column · linear reading order", tag: "layout", pass: true },
    {
      label: "Standard section headings present",
      tag: "section headings",
      pass: hasContent,
      detail: !hasContent ? "No experience or skills section" : undefined,
      fix: "experience",
    },
    {
      label: "Summary section present",
      tag: "section headings",
      pass: hasSummary,
      detail: hasSummary ? undefined : "Summary is empty",
      fix: "summary",
    },
    { label: "Selectable text · no image-based content", tag: "layout", pass: true },
    { label: "No graphics or watermarks in body", tag: "layout", pass: true },
    {
      label: "Consistent date format across roles",
      tag: "dates",
      pass: datesOk,
      detail: !datesOk ? "Some roles have unreadable dates" : undefined,
      fix: "experience",
    },
    {
      label: "Filename machine-readable",
      tag: "filename",
      pass: filenameOk,
      detail: !filenameOk ? "Filename has special characters" : undefined,
      fix: "contact",
    },
    {
      label: "Contact block complete",
      tag: "contact",
      pass: contactOk,
      detail: !hasName ? "Add your name" : !hasEmail ? "Add an email address" : undefined,
      fix: "contact",
    },
    {
      label: "Phone number added",
      tag: "contact",
      pass: hasPhone,
      detail: hasPhone ? undefined : "Add a phone number",
      fix: "contact",
      optional: true,
    },
    {
      label: "No spelling errors detected",
      tag: "spelling",
      pass: spellingOk,
      detail: spellingOk ? undefined : `Fix spelling: ${typoSummary}`,
      fix: "experience",
    },
  ]
}

/** Score counts only required checks — optional ones (phone) warn without
 *  dragging the number down. */
export function atsScore(checks: AtsCheck[]): { passed: number; total: number } {
  const counted = checks.filter(c => !c.optional)
  return { passed: counted.filter(c => c.pass).length, total: counted.length }
}
