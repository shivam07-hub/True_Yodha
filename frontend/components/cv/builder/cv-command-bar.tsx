"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { SheetExportActions } from "./cv-export-view"
import { I, LIcon } from "./library-icons"

interface CvCommandBarProps {
  title: string
  /** Second line under the title — a company, when the title is the role. */
  detail?: string
  onEdit: () => void
  actions: SheetExportActions
}

/**
 * Tools for the sheet on screen. Edit takes the width of the paper.
 * Download opens the two files this CV can already produce: PDF and DOCX.
 */
export function CvCommandBar({ title, detail, onEdit, actions }: CvCommandBarProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    firstItemRef.current?.focus()
    const onDoc = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const busyLabel = actions.pdfBusy ? "Building PDF…" : actions.docxBusy ? "Building DOCX…" : null

  function choose(run: () => void) {
    setOpen(false)
    triggerRef.current?.focus()
    run()
  }

  return (
    <div className="tm-lib-command">
      <div className="tm-lib-command-id">
        <h2 className="tm-lib-command-title">{title}</h2>
        {detail ? <p className="tm-lib-command-detail">{detail}</p> : null}
      </div>
      <div className="tm-lib-command-bar">
        <button type="button" className="tm-lib-btn primary tm-control-focus" onClick={onEdit}>
          <LIcon d={I.edit} size={15} />
          Edit
        </button>
        <div className="tm-lib-command-download" ref={rootRef}>
          <button
            ref={triggerRef}
            type="button"
            className="tm-lib-btn tm-lib-command-download-trigger tm-control-focus"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-busy={actions.pdfBusy || actions.docxBusy}
            onClick={() => setOpen((value) => !value)}
          >
            <LIcon d={I.download} size={15} />
            {busyLabel ?? "Download"}
            <LIcon d={I.chevD} size={14} />
          </button>
          {open ? (
            <div id={menuId} className="tm-lib-command-menu" role="menu" aria-label="Download options">
              <button
                ref={firstItemRef}
                type="button"
                role="menuitem"
                className="tm-lib-command-menu-item tm-control-focus"
                disabled={actions.pdfBusy}
                onClick={() => choose(actions.downloadPdf)}
              >
                {actions.pdfBusy ? "Building PDF…" : "Download PDF"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="tm-lib-command-menu-item tm-control-focus"
                disabled={actions.docxBusy}
                onClick={() => choose(actions.downloadDocx)}
              >
                {actions.docxBusy ? "Building DOCX…" : "Download DOCX"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {actions.docxError ? (
        <p className="tm-lib-command-error" role="alert">{actions.docxError}</p>
      ) : null}
    </div>
  )
}
