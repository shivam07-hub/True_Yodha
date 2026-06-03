"use client"

import { useEffect, useState } from "react"
import {
  CATEGORIES,
  CATEGORY_ORDER,
  type FeedbackCategory,
} from "./feedback-types"
import { CategoryGlyph } from "./category-glyph"

/**
 * Bottom-right floating action button. Hover expands 4 category quick-pills
 * (Bug · Idea · Question · Praise). Click → opens Feedback Hub via the
 * `tm:open-feedback` event the AppShell listens for. Pulse halo by default.
 *
 * Hidden on mobile (handled by Tailwind / @media — bottom nav owns that
 * corner). Hidden whenever the hub is already open to avoid stacking.
 */
export function FeedbackFAB({
  onOpen,
  pulse = true,
  hidden = false,
  subdued = false,
}: {
  onOpen: (category?: FeedbackCategory) => void
  pulse?: boolean
  hidden?: boolean
  /** First-run (no CV yet): neutral, no accent / pulse / notification dot so the
   *  Upload CTA owns the only accent on the page (D2, three-accent budget). */
  subdued?: boolean
}) {
  const [hover, setHover] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Collapse the expanded pills if the user navigates away with the keyboard.
  useEffect(() => {
    if (hidden && expanded) setExpanded(false)
  }, [hidden, expanded])

  if (hidden) return null

  return (
    <div
      data-tm-feedback-fab
      style={{
        position: "fixed",
        bottom: 22,
        right: 22,
        zIndex: 150,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 10,
        pointerEvents: "none",
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Quick-category mini pills */}
      {expanded &&
        CATEGORY_ORDER.map((id, i) => {
          const c = CATEGORIES[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => onOpen(id)}
              className="fade-up"
              aria-label={`Send ${c.label.toLowerCase()} feedback`}
              style={{
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 14px 7px 10px",
                borderRadius: 99,
                background: "var(--tm-surface)",
                border: `1px solid ${c.color}`,
                color: c.color,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: `0 6px 18px rgba(0,0,0,0.4), 0 0 12px ${c.wash}`,
                animationDelay: `${i * 40}ms`,
                animationFillMode: "both",
              }}
            >
              <span style={{ display: "grid", placeItems: "center", filter: `drop-shadow(0 0 3px ${c.color}66)` }}>
                <CategoryGlyph category={id} size={16} />
              </span>
              {c.label}
            </button>
          )
        })}

      {/* Main FAB */}
      <button
        type="button"
        onClick={() => onOpen()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label="Open feedback hub"
        title="Feedback — bug, idea, question (⌘/)"
        style={{
          pointerEvents: "auto",
          position: "relative",
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--tm-surface)",
          border: subdued ? "1px solid var(--tm-border)" : "1px solid var(--tm-interactive)",
          color: subdued ? "var(--tm-text-muted)" : "var(--tm-interactive)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          fontFamily: "inherit",
          boxShadow: hover
            ? "0 0 0 4px var(--tm-int-bg-wash), 0 0 24px var(--tm-int-bg-hover), 0 10px 30px rgba(0,0,0,0.5)"
            : subdued
              ? "0 8px 24px rgba(0,0,0,0.4)"
              : "0 0 18px var(--tm-int-border), 0 8px 24px rgba(0,0,0,0.5)",
          transition: "all 200ms var(--tm-ease)",
          animation: pulse && !subdued && !expanded && !hover ? "glow-pulse 3.2s ease-in-out infinite" : "none",
          transform: hover ? "scale(1.04)" : "scale(1)",
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={subdued ? undefined : { filter: "drop-shadow(0 0 6px var(--tm-int-bg-hover))" }}
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
        {/* Live notification dot — only once the user is past first-run (D2). */}
        {!subdued && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--tm-success)",
              border: "2px solid var(--tm-surface)",
              boxShadow: "0 0 6px var(--tm-success)",
            }}
          />
        )}
      </button>

      {/* Hover label */}
      {hover && !expanded && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 70,
            bottom: 14,
            padding: "8px 14px",
            background: "var(--tm-surface)",
            border: "1px solid var(--tm-int-border)",
            borderRadius: "var(--tm-radius-sm)",
            whiteSpace: "nowrap",
            fontSize: 12,
            color: "var(--tm-text)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            pointerEvents: "none",
          }}
        >
          <div>Feedback hub</div>
          <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 2 }}>
            <span className="mono" style={{ color: "var(--tm-interactive)" }}>⌘/</span> · bug, idea, question
          </div>
        </div>
      )}

    </div>
  )
}
