/**
 * TrimConfirm — one-page guard before Download PDF (page-fill meter).
 * Auto-trim hides the lowest-impact bullets (longest lines first) until the
 * sheet fits one page; "Download anyway" respects the user's call.
 */
"use client"

import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { IDEAL_CV_SPEC, estimateLines, type PageFill } from "@/lib/cv/page-fill"
import { Icon } from "./icons"

interface TrimConfirmProps {
  cv: CVStructured
  hiddenItems: Set<string>
  pageFill: PageFill
  toggleItem: (iid: string) => void
  onDownload: () => void
  onClose: () => void
}

export function TrimConfirm({ cv, hiddenItems, pageFill, toggleItem, onDownload, onClose }: TrimConfirmProps) {
  function autoTrimToFit() {
    onClose()
    const overflow = Math.max(0, Math.round(pageFill.ratio * IDEAL_CV_SPEC.lineBudget) - IDEAL_CV_SPEC.lineBudget)
    if (overflow <= 0) return
    const cpl = IDEAL_CV_SPEC.charsPerLine
    const cands: { iid: string; lines: number }[] = []
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      const iid = itemId("exp_bullet", ei * 100 + bi, b)
      if (!hiddenItems.has(iid)) cands.push({ iid, lines: estimateLines(b, cpl) })
    }))
    cands.sort((a, b) => b.lines - a.lines)
    let freed = 0
    for (const c of cands) { if (freed >= overflow) break; toggleItem(c.iid); freed += c.lines }
  }

  return (
    <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Trim to fit one page" onClick={onClose}>
      <div className="cvb-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="cvb-modal-head">Spills onto {pageFill.pages} pages</div>
        <div className="cvb-modal-body" style={{ padding: 18 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
            Recruiters skim one page. Auto-trim hides your lowest-impact bullets until it fits — or download as-is.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
            <button type="button" className="cvb-btn sm" onClick={onClose}>Cancel</button>
            <button type="button" className="cvb-btn sm" onClick={autoTrimToFit}><Icon name="sparkle" size={12} /> Auto-trim to fit</button>
            <button type="button" className="cvb-btn sm primary" onClick={() => { onClose(); onDownload() }}>
              <Icon name="download" size={12} /> Download anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
