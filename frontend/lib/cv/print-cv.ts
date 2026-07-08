/**
 * printCvPage — FALLBACK CV download via the browser's native "Save as PDF".
 *
 * NOT the primary path. Every CV download — authed and logged-out — now renders
 * through server-side headless Chromium (ADR-0020: exportSheetPdf /
 * exportAnonSheetPdf → POST /cv/export-pdf or /public/cv/export-pdf), which
 * embeds the exact Geist woff bytes and the shared sheet stylesheet so the PDF
 * cannot drift from the preview (₹ survives, no browser-print reflow). This
 * `window.print()` bridge remains ONLY as the fallback when that server render
 * is unavailable (503) — the browser's print engine does not embed fonts and
 * reflows layout, so it is a last resort, never the default.
 *
 * The `.cvb-pdf-page` element on screen IS the document; swapping document.title
 * seeds the suggested filename in the Save dialog.
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
