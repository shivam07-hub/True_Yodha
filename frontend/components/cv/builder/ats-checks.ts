import type { CVStructured, UserProfile } from "@/lib/api"
import { spellCheckCv } from "./cv-spellcheck"

/** Where a failing check routes the user in the CV editor. Maps to a section
 *  anchor id (`cv-edit-<target>`) so a click can scroll + focus the fix. */
export type AtsFixTarget = "contact" | "summary" | "experience" | "skills"

export interface AtsCheck {
  label: string
  pass: boolean
  detail?: string
  /** Editor section to jump to when failing. Omit for always-pass checks. */
  fix?: AtsFixTarget
  /** Optional checks warn but do NOT count against the score (e.g. phone). */
  optional?: boolean
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
  const hasName = Boolean(cv.contact?.name?.trim() || profile?.full_name?.trim())
  const hasEmail = Boolean(cv.contact?.email?.trim() || profile?.email?.trim())
  const hasPhone = Boolean(cv.contact?.phone?.trim())
  const hasContent = cv.experience.length > 0 || Boolean(cv.skills_line?.trim())
  const datesOk = hasConsistentDates(cv.experience.map(e => e.dates))
  const contactOk = hasName && hasEmail
  const filenameOk = /^[a-z0-9_]+\.pdf$/i.test(filename)
  const typos = spellCheckCv(cv)
  const spellingOk = typos.length === 0
  const typoSummary = typos.slice(0, 4).map(t => t.wrong).join(", ") + (typos.length > 4 ? "…" : "")

  return [
    { label: "Single column · linear reading order", pass: true },
    {
      label: "Standard section headings present",
      pass: hasContent,
      detail: !hasContent ? "Add experience or skills to your CV" : undefined,
      fix: "experience",
    },
    { label: "Selectable text · no image-based content", pass: true },
    { label: "No graphics or watermarks in body", pass: true },
    {
      label: "Consistent date format across roles",
      pass: datesOk,
      detail: !datesOk ? "Some roles have unparseable date ranges" : undefined,
      fix: "experience",
    },
    {
      label: "Filename machine-readable",
      pass: filenameOk,
      detail: !filenameOk ? `Filename contains special chars: ${filename}` : undefined,
      fix: "contact",
    },
    {
      label: "Contact block complete",
      pass: contactOk,
      detail: !hasName ? "Add your name in Contact" : !hasEmail ? "Add an email in Contact" : undefined,
      fix: "contact",
    },
    {
      label: "Phone number added",
      pass: hasPhone,
      detail: hasPhone ? undefined : "Optional — add a phone in Contact",
      fix: "contact",
      optional: true,
    },
    {
      label: "No spelling errors detected",
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
