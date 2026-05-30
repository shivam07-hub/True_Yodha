/**
 * Master CV download helpers (PR1 of the 10-min-CV fix).
 *
 * The /cv/download-pdf endpoint is content-agnostic: it renders whatever
 * cv_text it is handed. So downloading the master CV just needs the master's
 * plain text + a filename — no job, no tailoring, no new DB row.
 */
import { renderDeterministic } from "@/lib/cv-compose"
import type { CVStructured, CVVersion } from "@/lib/api"

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
 * Resolve the master CV as plain text for the PDF renderer.
 * Prefers the persisted `body_text` (rendered at upload); falls back to
 * rendering the structured CV when body_text is empty.
 */
export function resolveMasterText(
  baseline: CVVersion | null | undefined,
  cv: CVStructured | null | undefined,
): string {
  const body = baseline?.body_text?.trim()
  if (body) return body
  if (cv) return renderDeterministic(cv, new Set<string>())
  return ""
}
