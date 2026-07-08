/**
 * ApplyModal — CV Playground v2 apply confirm (WYSIWYG, CVJT1).
 *
 * Shows the SAME rendered sheet the Preview tab shows (never a text blob), the
 * score + "▲ +N raised in playground" delta, and how many fixes are still open.
 * Confirm freezes the exact sheet as the submission snapshot, then opens the
 * application page; the applied state confirms what was sent.
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
  submitting: boolean
  applied: boolean
  onConfirm: () => void
  onClose: () => void
  onBackToFixes: () => void
  onDownload: () => void
}

export function ApplyModal({
  cv, hidden, contact, company, jobTitle, ready, delta, pendingFixes,
  submitting, applied, onConfirm, onClose, onBackToFixes, onDownload,
}: ApplyModalProps) {
  return (
    <div
      className="cvb-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Apply to ${company}`}
      onClick={() => !submitting && onClose()}
    >
      <div className="cvb-modal cvb-v2-applymodal" onClick={e => e.stopPropagation()}>
        {applied ? (
          <div className="cvb-v2-appliedstate">
            <div className="cvb-v2-appliedcheck" aria-hidden>✓</div>
            <div className="cvb-v2-appliedtitle">Application sent to {company}</div>
            <div className="cvb-v2-appliedsub">
              Submitted at <b className="mono">{ready}/100</b> match
              {delta > 0 && <> — ▲ +{delta} of that you raised right here.</>}
            </div>
            <button type="button" className="cvb-v2-ghostbtn" onClick={onClose}>Back to playground</button>
          </div>
        ) : (
          <>
            <div className="cvb-v2-applyhead">
              <span className="cvb-v2-applytitle">Apply to {company}</span>
              <button type="button" className="cvb-intake-x" onClick={onClose} aria-label="Close" disabled={submitting}>✕</button>
            </div>
            <p className="cvb-v2-applylede">
              This exact sheet — the one you shaped — is saved as your submission for {jobTitle}.
              What you see is what they get.
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
              <button type="button" className="cvb-v2-ghostbtn" onClick={onDownload} disabled={submitting}>
                Download PDF
              </button>
              <button type="button" className="cvb-v2-ghostbtn" onClick={onClose} disabled={submitting}>
                Keep polishing
              </button>
              <button type="button" className="cvb-v2-applywide grow" onClick={onConfirm} disabled={submitting}>
                {submitting ? "Saving…" : "Confirm — apply with this CV"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
