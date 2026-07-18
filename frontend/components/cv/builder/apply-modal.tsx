/**
 * ApplyModal — CV Playground v2 apply confirm (WYSIWYG, CVJT1).
 *
 * Shows the SAME rendered sheet the Preview tab shows (never a text blob), the
 * score + "▲ +N raised in playground" delta, and how many fixes are still open.
 * Opening the application page does not claim submission. The exact sheet is
 * frozen only after the user returns and confirms that they submitted it.
 */
"use client"

import type { CVStructured } from "@/lib/api"
import { V2Sheet, type SheetContact } from "./preview-rail"

interface ApplyModalProps {
  cv: CVStructured
  hidden: Set<string>
  contact: SheetContact
  company: string
  jobTitle: string
  ready: number
  delta: number
  pendingFixes: number
  onConfirm: () => void
  onClose: () => void
  onBackToFixes: () => void
  onDownload: () => void
}

export function ApplyModal({
  cv, hidden, contact, company, jobTitle, ready, delta, pendingFixes,
  onConfirm, onClose, onBackToFixes, onDownload,
}: ApplyModalProps) {
  return (
    <div
      className="cvb-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Apply to ${company}`}
      onClick={onClose}
    >
      <div className="cvb-modal cvb-v2-applymodal" onClick={e => e.stopPropagation()}>
        <>
            <div className="cvb-v2-applyhead">
              <span className="cvb-v2-applytitle">Apply to {company}</span>
              <button type="button" className="cvb-intake-x" onClick={onClose} aria-label="Close">✕</button>
            </div>
            <p className="cvb-v2-applylede">
              Myro freezes this exact sheet only after you return and confirm you submitted it for {jobTitle}.
            </p>

            <div className="cvb-v2-applyscore">
              <div className="cvb-v2-applyscore-num">
                <span className="mono">{ready}</span>
                <span className="mono cvb-v2-applyscore-100">/100</span>
                <div className="cvb-v2-applyscore-cap">match for this job</div>
              </div>
              {delta > 0 && <span className="cvb-v2-deltachip mono">▲ +{delta} raised in playground</span>}
              <span className="cvb-v2-applyscore-spacer" />
              {pendingFixes > 0 && (
                <button type="button" className="cvb-v2-linkbtn" onClick={onBackToFixes}>
                  {pendingFixes} {pendingFixes === 1 ? "fix" : "fixes"} left →
                </button>
              )}
            </div>

            <div className="cvb-v2-applysheetwrap">
              <V2Sheet cv={cv} hidden={hidden} contact={contact} compact />
            </div>

            <div className="cvb-v2-applyfoot">
              <button type="button" className="cvb-v2-ghostbtn" onClick={onDownload}>
                Download PDF
              </button>
              <button type="button" className="cvb-v2-ghostbtn" onClick={onClose}>
                Keep polishing
              </button>
              <button type="button" className="cvb-v2-applywide grow" onClick={onConfirm}>
                Open application page
              </button>
            </div>
        </>
      </div>
    </div>
  )
}
