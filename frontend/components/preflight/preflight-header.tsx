"use client"

/**
 * Persistent header — the surface's name and the close control.
 *
 * The three-chapter ribbon (Name · Check · Search) is gone: the new canvas
 * has ONE mode, not three, so a bar counting three phases would be lying
 * about what state the shell is in. The name still reads because it is the
 * one thing on the screen labelling what the modal IS — everything else in
 * the canvas labels what's inside it.
 */

import { Icon } from "@/components/cv/builder/icons"

export function PreflightHeader({
  onClose,
  closable = true,
}: {
  onClose: () => void
  /** A run in flight has been charged for. Closing mid-stream would hide it,
   *  so the exit leaves rather than pretending the modal is dismissible. */
  closable?: boolean
}) {
  return (
    <div className="pf-head">
      <div className="pf-head-row">
        <div>
          <div className="pf-eyebrow">Myro Search</div>
        </div>
        {closable ? (
          <button type="button" className="pf-close tm-control-focus" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
