/**
 * TrimConfirm — the person's choice to fit a CV onto one page.
 *
 * Download is never routed through here. The meter offers this when the export
 * is over one page; confirming hides the longest bullets until the measured
 * sheet fits, or until hiding another bullet would not shorten it.
 */
"use client"

import { useEffect, useRef } from "react"
import { bulletsToHide } from "@/lib/cv/page-fill"
import { Button } from "@/components/ui/button"

interface TrimConfirmProps {
  sheet: HTMLElement | null
  toggleItem: (iid: string) => void
  onClose: () => void
}

export function TrimConfirm({ sheet, toggleItem, onClose }: TrimConfirmProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => { dialogRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      e.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function fitToOnePage() {
    if (sheet) {
      for (const id of bulletsToHide(sheet)) toggleItem(id)
    }
    onClose()
  }

  return (
    <div className="cvb-modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="cvb-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Fit to one page"
        style={{ maxWidth: 440 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="cvb-modal-head">Fit to one page</div>
        <div className="cvb-modal-body" style={{ padding: 18 }}>
          <p style={{ margin: 0, fontSize: "var(--tm-fs-body)", lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
            Hides the longest bullets until the CV is one page.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
            <Button variant="neutral" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={fitToOnePage}>Fit to one page</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
