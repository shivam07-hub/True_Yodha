"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import "./detail-drawer.css"

/**
 * Canonical job-detail shell — one product, two stages. Live (discover) and the
 * Dashboard (build) share this drawer: portal + scrim + right slide-in + Esc/
 * scrim close. Only the header / body / footer differ per surface.
 *
 * Portaling to <body> escapes the authed shell's transformed scroll container
 * (which would otherwise become the containing block for position:fixed). The
 * shell's own chrome uses global `--tm-*` tokens so it paints correctly outside
 * any component scope; `scopeClassName` re-introduces a component scope (e.g.
 * `.db`) so a body that relies on local CSS vars resolves through the portal.
 */
export function DetailDrawer({
  open,
  onClose,
  header,
  footer,
  children,
  scopeClassName,
  ariaLabel,
}: {
  open: boolean
  onClose: () => void
  header: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  /** Extra class on the drawer root so component-local CSS vars resolve. */
  scopeClassName?: string
  ariaLabel?: string
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div className={`jdrawer-root${scopeClassName ? ` ${scopeClassName}` : ""}`}>
      <div className="jdrawer-scrim" onClick={onClose} aria-hidden />
      <aside className="jdrawer" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        {header}
        <div className="jdrawer-scroll">{children}</div>
        {footer ? <div className="jdrawer-footer">{footer}</div> : null}
      </aside>
    </div>,
    document.body,
  )
}
