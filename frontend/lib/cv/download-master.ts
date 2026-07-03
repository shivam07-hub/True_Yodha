/**
 * Master CV download helpers.
 *
 * The master one-tap download is a WYSIWYG artifact (ADR-0020): the button
 * renders the canonical `PdfPage` sheet from the structured CV and exports it
 * via /cv/export-pdf. These helpers resolve the structured CV + printed
 * contact identity for that render. `body_text` is provenance (the raw upload
 * text for baselines — see CONTEXT.md · CV Version); it is never render input.
 */
import type { CVStructured, CVVersion } from "@/lib/api"
import type { PdfPageContact } from "@/components/cv/builder/pdf-page"

/**
 * `{First}_{Last}_CV.pdf` slug from the user's full name.
 * Falls back to `My_CV.pdf` when no usable name is present.
 */
export function masterFilename(fullName: string | null | undefined): string {
  const slug = (fullName ?? "")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join("_")
  return slug ? `${slug}_CV.pdf` : "My_CV.pdf"
}

/**
 * Resolve the structured master CV for the sheet render.
 * Prefers the explicitly passed structured CV; falls back to the baseline's
 * snapshot. Returns null when neither carries renderable content (the backend
 * coerces absent snapshots to `{}`), so callers can disable the download.
 */
export function resolveMasterStructured(
  baseline: CVVersion | null | undefined,
  cv: CVStructured | null | undefined,
): CVStructured | null {
  const candidate = cv ?? (baseline?.cv_structured as CVStructured | null | undefined) ?? null
  if (!candidate) return null
  const normalized: CVStructured = {
    contact: candidate.contact,
    summary: candidate.summary ?? null,
    education: candidate.education ?? [],
    experience: candidate.experience ?? [],
    projects: candidate.projects ?? [],
    skills_line: candidate.skills_line ?? null,
    certs: candidate.certs ?? [],
  }
  const hasContent =
    normalized.experience.length > 0 ||
    normalized.education.length > 0 ||
    normalized.projects.length > 0 ||
    Boolean(normalized.summary) ||
    Boolean(normalized.skills_line)
  return hasContent ? normalized : null
}

/** Printed contact identity for the master sheet: CV contact first, profile
 *  name as fallback. Mirrors the derivation the master panel uses. */
export function masterContactFromCV(
  cv: CVStructured,
  fullName: string | null | undefined,
): PdfPageContact {
  const c = cv.contact
  return {
    name: c?.name?.trim() || fullName?.trim() || "Your name",
    title: c?.title?.trim() || cv.experience[0]?.role || "",
    location: c?.location?.trim() || "",
    email: c?.email?.trim() || "",
    phone: c?.phone?.trim() || "",
    linkedin: c?.linkedin?.trim() || "",
  }
}
