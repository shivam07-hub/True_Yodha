/**
 * printCvPage — WYSIWYG CV download via the browser's native "Save as PDF".
 *
 * The `.cvb-pdf-page` element on screen IS the document. The print stylesheet
 * in cv-builder.css isolates it, so the saved PDF is exactly what the user
 * previewed — real selectable text (ATS-parseable), not a rasterized image.
 * Swapping document.title seeds the suggested filename in the Save dialog.
 *
 * This is the client-side bridge. PR5 swaps in server-side headless Chromium
 * (Playwright) for pixel-stable, headless PDF + DOCX — feeding it the SAME
 * `.cvb-pdf-page` HTML/CSS, so this template is the durable asset, not throwaway.
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
