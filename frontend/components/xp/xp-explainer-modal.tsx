"use client"

import Link from "next/link"
import { Sparkles, X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { XpFairnessNote, XpGuideLists } from "@/components/xp/xp-guide-content"
import "./xp-explainer-modal.css"

export function XpExplainerModal({
  open,
  onClose,
  balance,
}: {
  open: boolean
  onClose: () => void
  balance: number
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[760px] max-w-[calc(100%-1.5rem)] p-0 bg-transparent ring-0"
        style={{
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-lg)",
          boxShadow: "0 0 60px rgba(0,0,0,0.62)",
          overflow: "hidden",
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="tm-xp-explainer-header" style={{
          padding: "20px 22px",
          borderBottom: "1px solid var(--tm-border-soft)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
          background: "var(--tm-surface)",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "var(--tm-interactive)",
            color: "var(--tm-interactive-fg)",
            boxShadow: "0 0 18px var(--tm-int-bg-hover)",
            flexShrink: 0,
          }}>
            <Sparkles size={19} aria-hidden />
          </div>
          <div className="tm-xp-explainer-header-title" style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--tm-text)" }}>
              How Myro Coins Work
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--tm-text-faint)", lineHeight: 1.45 }}>
              Earn Myro Coins by doing career work. Spend them on heavier analysis.
            </p>
          </div>
          <div className="tm-xp-explainer-header-balance" style={{
            padding: "7px 10px",
            borderRadius: 8,
            background: "var(--tm-int-bg-wash)",
            border: "1px solid var(--tm-int-border)",
            fontFamily: "var(--tm-font-mono)",
            fontSize: 13,
            fontWeight: 800,
            color: "var(--tm-text)",
            whiteSpace: "nowrap",
          }}>
            {balance} Myro Coins
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Myro Coins guide"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid transparent",
              background: "transparent",
              color: "var(--tm-text-faint)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", flex: 1, minHeight: 0 }}>
          <XpGuideLists compact />
        </div>

        <div className="tm-xp-explainer-footer" style={{
          padding: "16px 22px",
          borderTop: "1px solid var(--tm-border-soft)",
          background: "var(--tm-surface)",
          flexShrink: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          gap: 12,
          alignItems: "center",
        }}>
          <XpFairnessNote compact />
          <Link
            href="/tokens"
            onClick={onClose}
            className="tm-xp-explainer-footer-cta"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 36,
              padding: "0 12px",
              borderRadius: "var(--tm-radius-sm)",
              border: "1px solid var(--tm-int-border)",
              background: "var(--tm-int-bg-wash)",
              color: "var(--tm-interactive)",
              fontSize: 12,
              fontWeight: 800,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Open guide
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}
