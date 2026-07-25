/**
 * MentorProposalDrawer — the focused space a Mentor fix pops into.
 *
 * Resume-Worded inspiration (grill 2026-07-25): a rewrite or merge no longer
 * unfolds inline in the CV playground where it competes with the whole document.
 * It pops OUT into one focused surface — a right-side drawer on desktop, a
 * bottom-sheet on 375px — holding the original line(s), Mentor's proposal, and a
 * single accept/reject decision. One pattern, both viewports, one mental model
 * across every proposal surface (playground rewrite + merge, anon preview).
 *
 * The trigger (the ✦ Rewrite button, the merge-select icons) stays inline in the
 * row; only the ACTIVE proposal lives here. The host owns open/close state.
 */
"use client"

import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Icon } from "./icons"

interface MentorProposalDrawerProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export function MentorProposalDrawer({ open, title, onClose, children }: MentorProposalDrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="cvb-mpd-scrim" role="presentation" onClick={onClose}>
      <div
        className="cvb-mpd-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cvb-mpd-grab" aria-hidden="true" />
        <div className="cvb-mpd-head">
          <span className="cvb-mpd-title"><Icon name="sparkle" size={13} /> {title}</span>
          <button type="button" className="cvb-mpd-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="cvb-mpd-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
