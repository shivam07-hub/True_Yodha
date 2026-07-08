/**
 * sheet-pdf — the ONE way a rendered `.cvb-pdf-page` sheet becomes a
 * downloaded PDF (ADR-0020: every CV artifact is WYSIWYG).
 *
 * The sheet's outerHTML — the literal DOM the user previews — is posted to
 * POST /cv/export-pdf, where headless Chromium renders it with the shared
 * sheet stylesheet. Both consumers (CVExportView, DownloadCVButton) go
 * through here; there is no plain-text render path.
 */
import { cv as cvApi, publicCv } from "@/lib/api"

/** Retry a flaky export call with linear backoff — weak mobile networks (the
 *  core audience) drop a single request often, but a second attempt usually
 *  lands. Keeps the export from failing on one transient blip. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 2, baseDelayMs = 600): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseDelayMs * (i + 1)))
    }
  }
  throw lastErr
}

export function triggerBlobDownload(blob: Blob, filename: string, mime: string) {
  // Wrap in File so mobile Safari + Android Chrome honor the name on blob: URLs.
  const file = new File([blob], filename, { type: mime })
  const url = URL.createObjectURL(file)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Render *sheet* (a `.cvb-pdf-page` element) to a PDF server-side and save it.
 *  Throws when the server renderer is unavailable after retries — callers
 *  decide the fallback (native print where a visible sheet exists). */
export async function exportSheetPdf(token: string, sheet: HTMLElement, filename: string): Promise<void> {
  const blob = await withRetry(() => cvApi.exportPdf(token, { html: sheet.outerHTML, filename }))
  triggerBlobDownload(blob, filename, "application/pdf")
}

/** Anon twin of exportSheetPdf for the logged-out playground — SAME sheet,
 *  SAME server Chromium renderer (via the public endpoint), so the download is
 *  WYSIWYG rather than browser-print. Throws on 503; the caller falls back to
 *  native print. */
export async function exportAnonSheetPdf(sheet: HTMLElement, filename: string): Promise<void> {
  const blob = await withRetry(() => publicCv.exportPdf(sheet.outerHTML, filename))
  triggerBlobDownload(blob, filename, "application/pdf")
}
