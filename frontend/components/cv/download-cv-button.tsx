/**
 * DownloadCVButton — one-tap master CV PDF download.
 *
 * Self-contained (inline SVG, no cv-builder Icon dep) so it mounts on both the
 * authed /cv surface and the onboarding StepScore surface. Honors the 10-min
 * North Star: a parsed master CV is downloadable immediately, no tailoring.
 */
"use client"

import { useState } from "react"
import type { CVStructured, CVVersion } from "@/lib/api"
import { cv as cvApi } from "@/lib/api"
import { masterFilename, resolveMasterText } from "@/lib/cv/download-master"

interface Props {
  token: string
  baseline: CVVersion | null
  cv?: CVStructured | null
  fullName?: string | null
  label?: string
  /** Class applied to the button element (e.g. `cvb-btn` on the /cv surface). */
  className?: string
  /** Inline style applied to the button element (onboarding has no cvb-* CSS). */
  style?: React.CSSProperties
}

function DownloadGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  )
}

export function DownloadCVButton({
  token, baseline, cv, fullName, label = "Download CV", className, style,
}: Props) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const text = resolveMasterText(baseline, cv)
  // Endpoint requires cv_text >= 60 chars; guard against an empty master.
  const ready = text.length >= 60
  const disabled = downloading || !ready

  async function handleDownload() {
    if (disabled) return
    setError(null)
    setDownloading(true)
    try {
      const filename = masterFilename(fullName)
      const blob = await cvApi.downloadPdf(token, text, filename)
      // Wrap in File so mobile Safari + Android Chrome honor the name even
      // when the `download` attr alone is ignored on blob: URLs.
      const file = new File([blob], filename, { type: "application/pdf" })
      const url = URL.createObjectURL(file)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.rel = "noopener"
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate PDF.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={handleDownload}
        disabled={disabled}
        aria-busy={downloading}
        title={ready ? label : "Upload a CV first"}
      >
        <DownloadGlyph />
        {downloading ? "Preparing…" : label}
      </button>
      {error && (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger, #ef4444)" }}>
          {error}
        </p>
      )}
    </>
  )
}
