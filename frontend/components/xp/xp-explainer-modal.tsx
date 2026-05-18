"use client"

import Link from "next/link"
import { Sparkles, X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { XpFairnessNote, XpGuideLists } from "@/components/xp/xp-guide-content"

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
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-lg)",
          boxShadow: "0 0 60px rgba(0,0,0,0.62)",
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "20px 22px",
          borderBottom: "1px solid var(--tm-border-soft)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "var(--tm-accent)",
            color: "var(--tm-accent-fg)",
            boxShadow: "0 0 18px var(--tm-accent-glow)",
            flexShrink: 0,
          }}>
            <Sparkles size={19} aria-hidden />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--tm-text)" }}>
              How XP Works
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--tm-text-faint)", lineHeight: 1.45 }}>
              Earn XP by doing career work. Spend it on heavier analysis.
            </p>
          </div>
          <div style={{
            padding: "7px 10px",
            borderRadius: 8,
            background: "var(--tm-accent-wash)",
            border: "1px solid var(--tm-accent-ring)",
            fontFamily: "var(--tm-font-mono)",
            fontSize: 13,
            fontWeight: 800,
            color: "var(--tm-text)",
            whiteSpace: "nowrap",
          }}>
            {balance} XP
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close XP guide"
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

        <div style={{ padding: 22 }}>
          <XpGuideLists compact />
        </div>

        <div style={{
          margin: "0 22px 22px",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          gap: 12,
          alignItems: "center",
        }}>
          <XpFairnessNote compact />
          <Link
            href="/xp"
            onClick={onClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 36,
              padding: "0 12px",
              borderRadius: "var(--tm-radius-sm)",
              border: "1px solid var(--tm-accent-ring)",
              background: "var(--tm-accent-wash)",
              color: "var(--tm-accent)",
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
