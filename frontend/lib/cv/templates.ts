/**
 * CV export templates — three ATS-safe print-CSS variants of `.cvb-pdf-page`.
 *
 * The `id` is written to `data-cv-template` on the page root; the print
 * stylesheet in cv-builder.css keys its variant rules off that attribute, so a
 * template change is pure CSS — same DOM, same selectable text, same ATS pass.
 *
 * Phase 2 defines the contract. Phase 3 ships the CSS variants + the picker UI.
 */
export type CVTemplate = "classic" | "modern" | "compact"

export interface CVTemplateMeta {
  id: CVTemplate
  label: string
  description: string
}

export const CV_TEMPLATES: CVTemplateMeta[] = [
  { id: "classic", label: "ATS Classic", description: "Serif-clean, single column. The safe default for any applicant tracking system." },
  { id: "modern", label: "Modern Minimal", description: "Tighter type scale and lighter rules — same single-column ATS structure." },
  { id: "compact", label: "Compact One-Page", description: "Condensed spacing to fit a dense CV onto a single page." },
]

export const DEFAULT_TEMPLATE: CVTemplate = "classic"

export function isCVTemplate(v: string | null | undefined): v is CVTemplate {
  return v === "classic" || v === "modern" || v === "compact"
}
