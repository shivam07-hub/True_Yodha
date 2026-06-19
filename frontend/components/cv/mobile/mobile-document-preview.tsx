"use client"

import { useEffect, useRef, useState } from "react"
import type { CVStructured } from "@/lib/api"
import type { CVTemplate } from "@/lib/cv/templates"
import { PdfPage, type PdfPageContact } from "@/components/cv/builder/pdf-page"

interface MobileDocumentPreviewProps {
  cv: CVStructured
  contact: PdfPageContact
  template?: CVTemplate
  footerMarkHidden?: boolean
  company?: string
  className?: string
}

export function MobileDocumentPreview({
  cv,
  contact,
  template = "classic",
  footerMarkHidden = true,
  company,
  className = "",
}: MobileDocumentPreviewProps) {
  return (
    <MobileScaledSheet className={className}>
      <PdfPage
        cv={cv}
        hidden={new Set()}
        contact={contact}
        company={company}
        template={template}
        footerMarkHidden={footerMarkHidden}
      />
    </MobileScaledSheet>
  )
}

export function MobileScaledSheet({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  const [height, setHeight] = useState(430)

  useEffect(() => {
    const frame = frameRef.current
    const sheet = sheetRef.current
    if (!frame || !sheet) return

    const sync = () => {
      const nextScale = Math.min(1, frame.clientWidth / 816)
      const sheetHeight = sheet.querySelector<HTMLElement>(".cvb-pdf-page")?.offsetHeight ?? 1056
      setScale(nextScale)
      setHeight(Math.ceil(sheetHeight * nextScale))
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(frame)
    observer.observe(sheet)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frameRef} className={`tm-mcv-preview-frame ${className}`.trim()} style={{ height }}>
      <div
        ref={sheetRef}
        className="tm-mcv-preview-sheet"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
