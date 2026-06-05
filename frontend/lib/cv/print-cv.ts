/**
 * printCvPage — WYSIWYG CV download via the browser's native "Save as PDF".
 *
 * The `.cvb-pdf-page` element on screen IS the document. The print stylesheet
 * in cv-builder.css isolates it, so the saved PDF is exactly what the user
 * previewed — real selectable text (ATS-parseable), not a rasterized image.
 * Swapping document.title seeds the suggested filename in the Save dialog.
 *
 * This is the client-side bridge and the PDF engine: the print dialog's "Save
 * as PDF" already emits the exact on-screen sheet as selectable, ATS-parseable
 * text, so preview === download. DOCX export is server-side (python-docx, see
 * cvApi.exportDocx → /cv/export-docx), fed the SAME visible sections.
 *
 * FUTURE (infra step, not yet wired): a server-side headless Chromium
 * (Playwright) rendering this SAME `.cvb-pdf-page` HTML/CSS for pixel-stable,
 * machine-generated PDFs. Deferred because it needs a chromium binary in the
 * backend image — a deploy decision, not a code-only change.
 */
export function printCvPage(filename: string): void {
  if (typeof window === "undefined") return
  const prev = document.title
  document.title = filename.replace(/\.pdf$/i, "")
  const restore = () => {
    document.title = prev
    window.removeEventListener("afterprint", restore)
  }
  window.addEventListener("afterprint", restore)
  // Fallback restore — Safari does not always fire afterprint.
  window.setTimeout(restore, 1500)
  window.print()
}
