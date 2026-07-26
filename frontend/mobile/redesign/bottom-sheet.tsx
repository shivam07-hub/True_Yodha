"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/* ══════════════════════════════════════════════════════════════════════════
   BottomSheet — the shared modal sheet chrome for the mobile redesign (job
   detail, add job, practice, filters). Scrim + rounded-top panel + grab handle
   + drag-to-dismiss + up/down animation, ported from the handoff. `label` sets
   the a11y name; children fill the scroll body.
   ══════════════════════════════════════════════════════════════════════════ */

export function BottomSheet({
  open,
  onClose,
  label,
  children,
  maxHeight,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
  /** e.g. "88%" for the tall job-detail sheet; omit to hug content. */
  maxHeight?: string
}) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const [dy, setDy] = useState(0)
  const grabY = useRef<number | null>(null)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); setDy(0) }
  }, [open])

  const requestClose = () => {
    setClosing(true)
    setTimeout(() => { setMounted(false); setClosing(false); setDy(0); onClose() }, 230)
  }

  if (!mounted || typeof document === "undefined") return null

  const onGrabDown = (e: React.PointerEvent) => { grabY.current = e.clientY }
  const onGrabMove = (e: React.PointerEvent) => {
    if (grabY.current == null) return
    const delta = e.clientY - grabY.current
    if (delta > 0) setDy(delta)
  }
  const onGrabUp = () => {
    if (dy > 80) requestClose()
    else setDy(0)
    grabY.current = null
  }

  // Portalled to <body> — a mobile sheet must outrank the fixed bottom nav,
  // and <main> (app-shell.tsx) sets z-index:2, which traps any in-tree
  // fixed-position z-index below the nav's z-index:30 in the real root
  // stacking context. Escaping the tree is the only fix that isn't a z-index
  // arms race.
  return createPortal(
    <div className="mm-root" role="dialog" aria-label={label} aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 240 }}>
      <div
        onClick={requestClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", animation: `${closing ? "mm-scrimOut" : "mm-scrimIn"} 240ms ease forwards` }}
      />
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          maxHeight: maxHeight ?? undefined,
          display: "flex", flexDirection: "column",
          background: "var(--mm-card-2)", borderRadius: "22px 22px 0 0", borderTop: "1px solid var(--mm-border)",
          animation: `${closing ? "mm-sheetDown" : "mm-sheetUp"} 320ms cubic-bezier(0.32,0.72,0,1) forwards`,
          transform: dy > 0 ? `translateY(${dy}px)` : undefined,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          style={{ flex: "none", padding: "9px 0 6px", display: "flex", justifyContent: "center", cursor: "grab", touchAction: "none" }}
        >
          <div style={{ width: 36, height: 4.5, borderRadius: 99, background: "rgba(255,255,255,0.16)" }} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
