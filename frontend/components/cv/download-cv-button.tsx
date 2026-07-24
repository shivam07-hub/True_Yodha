/**
 * DownloadCVButton — one-tap master CV PDF download.
 *
 * WYSIWYG consumer (ADR-0020): renders the canonical `PdfPage` sheet from the
 * structured CV in a hidden mount and exports its outerHTML through the same
 * /cv/export-pdf Chromium path as the playground export — one renderer, every
 * surface. Self-contained (inline SVG) so it mounts on both the authed /cv
 * surface and the onboarding StepScore surface. Honors the 10-min North Star:
 * a parsed master CV is downloadable immediately, no tailoring.
 */
"use client"

import { useRef, useState } from "react"
import type { CVStructured, CVVersion } from "@/lib/api"
import { Button, type buttonVariants } from "@/components/ui/button"
import type { VariantProps } from "class-variance-authority"
import { PdfPage } from "@/components/cv/builder/pdf-page"
import { masterContactFromCV, masterFilename, resolveMasterStructured } from "@/lib/cv/download-master"
import { exportSheetPdf } from "@/lib/cv/sheet-pdf"

interface Props {
  token: string
  baseline: CVVersion | null
  cv?: CVStructured | null
  fullName?: string | null
  label?: string
  /** Class applied to the button element (e.g. on the /cv surface). */
  className?: string
  /** Inline style applied to the button element (onboarding has no cvb-* CSS). */
  style?: React.CSSProperties
  /** Opt into the canonical <Button> primitive. Omitted = plain <button> (back-compat
      for callers with their own bespoke className/style, e.g. onboarding's inline CTA). */
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
}

const NO_HIDDEN = new Set<string>()

function DownloadGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  )
}

export function DownloadCVButton({
  token, baseline, cv, fullName, label = "Download CV", className, style, variant, size,
}: Props) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sheetWrapRef = useRef<HTMLDivElement>(null)

  const structured = resolveMasterStructured(baseline, cv)
  const ready = structured !== null
  const disabled = downloading || !ready

  async function handleDownload() {
    if (disabled) return
    const sheet = sheetWrapRef.current?.querySelector<HTMLElement>(".cvb-pdf-page")
    if (!sheet) return
    setError(null)
    setDownloading(true)
    try {
      const name = fullName?.trim() || structured?.contact?.name || null
      await exportSheetPdf(token, sheet, masterFilename(name))
    } catch {
      setError("Could not generate the PDF — please try again.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      {variant ? (
        <Button
          variant={variant}
          size={size}
          className={className}
          style={style}
          onClick={handleDownload}
          disabled={disabled}
          aria-busy={downloading}
          title={ready ? label : "Upload a CV first"}
        >
          <DownloadGlyph />
          {downloading ? "Preparing…" : label}
        </Button>
      ) : (
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
      )}
      {error && (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger, #ef4444)" }}>
          {error}
        </p>
      )}
      {structured && (
        // Hidden WYSIWYG sheet: the SAME PdfPage DOM every export surface
        // renders, serialized (outerHTML) for the server Chromium render.
        // display:none keeps it out of layout AND out of the print isolation
        // (`@media print` visibility rules cannot resurrect display:none).
        <div ref={sheetWrapRef} hidden aria-hidden="true">
          <PdfPage
            cv={structured}
            hidden={NO_HIDDEN}
            contact={masterContactFromCV(structured, fullName)}
            footerMarkHidden={baseline?.footer_mark_hidden ?? false}
          />
        </div>
      )}
    </>
  )
}
