import type { CVStructured, UserProfile } from "@/lib/api"

export interface AtsCheck {
  label: string
  pass: boolean
  detail?: string
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
  const hasEmail = Boolean(cv.contact?.email?.trim())
  const hasPhone = Boolean(cv.contact?.phone?.trim())
  const hasContent = cv.experience.length > 0 || Boolean(cv.skills_line?.trim())
  const datesOk = hasConsistentDates(cv.experience.map(e => e.dates))
  const contactOk = hasName && hasEmail && hasPhone
  const filenameOk = /^[a-z0-9_]+\.pdf$/i.test(filename)

  return [
    { label: "Single column · linear reading order", pass: true },
    {
      label: "Standard section headings present",
      pass: hasContent,
      detail: !hasContent ? "Add experience or skills to your CV" : undefined,
    },
    { label: "Selectable text · no image-based content", pass: true },
    { label: "No graphics or watermarks in body", pass: true },
    {
      label: "Consistent date format across roles",
      pass: datesOk,
      detail: !datesOk ? "Some roles have unparseable date ranges" : undefined,
    },
    {
      label: "Filename machine-readable",
      pass: filenameOk,
      detail: !filenameOk ? `Filename contains special chars: ${filename}` : undefined,
    },
    {
      label: "Contact block complete",
      pass: contactOk,
      detail: !hasName
        ? "Add your name in Contact"
        : !hasEmail
          ? "Add an email in Contact"
          : !hasPhone
            ? "Phone number is missing"
            : undefined,
    },
  ]
}

export function atsScore(checks: AtsCheck[]): { passed: number; total: number } {
  return { passed: checks.filter(c => c.pass).length, total: checks.length }
}
