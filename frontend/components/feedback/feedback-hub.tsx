"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { HubGlyph } from "./category-glyph"
import { type FeedbackCategory } from "./feedback-types"
import { NewReport } from "./new-report"
import { MyReports } from "./my-reports"
import { Shipped } from "./shipped"
import { SentState } from "./sent-state"
import "./feedback-hub.css"

export interface FeedbackHubProps {
  open: boolean
  onClose: () => void
  defaultCategory?: FeedbackCategory
  defaultTab?: "new" | "reports" | "shipped"
  showContext?: boolean
  showHistory?: boolean
  showShipped?: boolean
  userName?: string | null
  userEmail?: string | null
  onPinElement?: () => void
  pinnedTarget?: string | null
  onClearPin?: () => void
}

type TabId = "new" | "reports" | "shipped"

export function FeedbackHub({
  open,
  onClose,
  defaultCategory = "bug",
  defaultTab = "new",
  showContext = true,
  showHistory = true,
  showShipped = false,
  userName = null,
  userEmail = null,
  onPinElement,
  pinnedTarget = null,
  onClearPin,
}: FeedbackHubProps) {
  const [tab, setTab] = useState<TabId>(defaultTab)
  const [sent, setSent] = useState<FeedbackCategory | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open) {
      setTab(defaultTab)
      setSent(null)
    }
  }, [open, defaultTab])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const tabs = (
    [
      { id: "new", label: "New report", show: true },
      { id: "reports", label: "My reports", show: showHistory },
      { id: "shipped", label: "Shipped", show: showShipped },
    ] satisfies { id: TabId; label: string; show: boolean }[]
  ).filter((t) => t.show)

  function handleSent(category: FeedbackCategory) {
    setSent(category)
    queryClient.invalidateQueries({ queryKey: ["feedback-my"] })
  }

  function clearPin() {
    onClearPin?.()
  }

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 400,
          background: "rgba(5, 10, 24, 0.7)",
          backdropFilter: "blur(8px)",
          animation: "scrim-in 220ms var(--tm-ease) both",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Feedback hub"
        onClick={(e) => e.stopPropagation()}
        className="tm-feedback-hub"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(920px, calc(100vw - 32px))",
          height: "min(680px, calc(100dvh - 48px))",
          zIndex: 401,
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-lg)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0,245,212,0.08)",
          display: "flex",
          overflow: "hidden",
          animation: "modal-in 280ms var(--tm-ease) both",
        }}
      >
        {/* Left rail */}
        <aside
          className="tm-feedback-rail"
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: "1px solid var(--tm-border-soft)",
            display: "flex",
            flexDirection: "column",
            background: "rgba(255,255,255,0.012)",
          }}
        >
          <div style={{ padding: "20px 18px 18px", borderBottom: "1px solid var(--tm-border-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  border: "1px solid var(--tm-accent-ring)",
                  background: "var(--tm-bg)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--tm-accent)",
                  filter: "drop-shadow(0 0 6px var(--tm-accent-glow))",
                }}
              >
                <HubGlyph size={14} />
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Feedback hub</div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--tm-text-faint)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Direct line to the team
                </div>
              </div>
            </div>
          </div>

          <nav style={{ padding: 10, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id)
                  setSent(null)
                }}
                aria-current={tab === t.id ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--tm-radius-sm)",
                  background: tab === t.id ? "var(--tm-accent-wash)" : "transparent",
                  border: `1px solid ${tab === t.id ? "var(--tm-accent-ring)" : "transparent"}`,
                  color: tab === t.id ? "var(--tm-accent)" : "var(--tm-text-muted)",
                  fontSize: 13,
                  fontWeight: tab === t.id ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  transition: "all 160ms",
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div
            style={{
              padding: 14,
              borderTop: "1px solid var(--tm-border-soft)",
              fontSize: 10,
              color: "var(--tm-text-faint)",
              lineHeight: 1.6,
            }}
          >
            <div className="eyebrow">Response time</div>
            <div className="mono" style={{ color: "var(--tm-accent)", fontSize: 18, fontWeight: 700, marginTop: 4 }}>
              14h
            </div>
            <div style={{ marginTop: 2 }}>median · 1 human reads</div>
          </div>
        </aside>

        {/* Right content */}
        <div className="tm-feedback-panel" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <header
            className="tm-feedback-header"
            style={{
              padding: "20px 28px 16px",
              borderBottom: "1px solid var(--tm-border-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--tm-text)", margin: 0 }}>
                {tab === "new" && (sent ? "Dispatch sent" : "Send a signal")}
                {tab === "reports" && "Your dispatches"}
                {tab === "shipped" && "Shipped from feedback"}
              </h2>
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--tm-text-faint)" }}>
                {tab === "new" && !sent && "We read every dispatch. Be terse, be specific."}
                {tab === "reports" && "Track status. Replies arrive when we have follow-ups."}
                {tab === "shipped" && "Public log of what user signal turned into."}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close feedback hub"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--tm-border-soft)",
                color: "var(--tm-text-faint)",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                display: "grid",
                placeItems: "center",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--tm-text)"
                e.currentTarget.style.borderColor = "var(--tm-border)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--tm-text-faint)"
                e.currentTarget.style.borderColor = "var(--tm-border-soft)"
              }}
            >
              ×
            </button>
          </header>

          <div className="tm-feedback-body" style={{ flex: 1, overflowY: "auto", padding: "20px 28px 24px" }}>
            {tab === "new" && !sent && (
              <NewReport
                defaultCategory={defaultCategory}
                showContext={showContext}
                userName={userName}
                userEmail={userEmail}
                onSent={handleSent}
                onPinElement={onPinElement}
                pinnedTarget={pinnedTarget}
                onClearPin={clearPin}
              />
            )}
            {tab === "new" && sent && (
              <SentState category={sent} onClose={onClose} onNew={() => setSent(null)} />
            )}
            {tab === "reports" && <MyReports />}
            {tab === "shipped" && <Shipped />}
          </div>
        </div>
      </div>
    </>
  )
}
export type { FeedbackCategory } from "./feedback-types"
export { CATEGORIES } from "./feedback-types"
