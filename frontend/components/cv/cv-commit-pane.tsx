/**
 * CVCommitPane — single pane for the CV Builder right column.
 *
 * Two modes:
 *   - "unsaved"  → dashed warning border, "LIVE PREVIEW · UNSAVED" chip, dirty text from playground.
 *   - "saved"    → solid accent border, "SAVED · COMPANY CV V{n}" chip, the persisted version text.
 *
 * After a save, the parent flips mode="unsaved" → mode="saved" with the SAME width and
 * SAME position. The chip animates a scale-pop on transition into "saved" so the user
 * registers the commit without the layout vanishing. Closes the reported UX gap where
 * the picker swap looked like data loss.
 */
"use client"

import { useEffect, useRef } from "react"
import type { CVVersion } from "@/lib/api"
import { formatThreadVersionLabel } from "@/components/cv/version-picker"

interface CVCommitPaneProps {
  mode: "unsaved" | "saved"
  text: string
  // saved-mode metadata
  version?: CVVersion | null
  threadVersions?: CVVersion[]
  // affordances
  onPolish?: () => void
  isPolishing?: boolean
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function CVCommitPane({ mode, text, version, threadVersions = [], onPolish, isPolishing }: CVCommitPaneProps) {
  const chipRef = useRef<HTMLDivElement>(null)
  const prevMode = useRef(mode)

  // Scale-pop the chip whenever we cross into "saved". Compositor-only properties
  // (transform + opacity) so no layout thrash.
  useEffect(() => {
    if (prevMode.current !== mode && mode === "saved" && chipRef.current) {
      const node = chipRef.current
      node.animate(
        [
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(1.08)", opacity: 1, offset: 0.45 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: 320, easing: "cubic-bezier(0.22,1,0.36,1)" },
      )
    }
    prevMode.current = mode
  }, [mode])

  const isSaved = mode === "saved"
  const accent = isSaved ? "var(--tm-accent)" : "var(--tm-warning)"
  const borderStyle = isSaved ? "solid" : "dashed"
  const label = isSaved ? "SAVED" : "LIVE PREVIEW · UNSAVED"
  const versionLabel = isSaved && version
    ? ` · ${formatThreadVersionLabel(version, threadVersions)}`
    : ""

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div
          ref={chipRef}
          className="tm-label-caps"
          style={{
            color: accent,
            transformOrigin: "left center",
            willChange: "transform",
          }}
        >
          {label}{versionLabel}
        </div>
        {isSaved && version && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--tm-text-faint)" }}>
            <span>{timeAgo(version.created_at)}</span>
            {onPolish && version.kind !== "polished" && version.kind !== "edited" && (
              <button
                type="button"
                onClick={onPolish}
                disabled={isPolishing}
                style={{
                  padding: "4px 10px", borderRadius: 99,
                  background: "transparent", border: "1px solid var(--tm-accent-ring)",
                  color: "var(--tm-accent)", fontSize: 11, fontWeight: 600,
                  cursor: isPolishing ? "default" : "pointer", fontFamily: "inherit",
                  opacity: isPolishing ? 0.5 : 1,
                }}
              >
                {isPolishing ? "Polishing…" : "★ Polish with AI"}
              </button>
            )}
          </div>
        )}
      </div>

      <pre style={{
        margin: 0, padding: "20px 22px",
        background: "var(--tm-surface)",
        border: `1px ${borderStyle} ${accent}`,
        borderRadius: "var(--tm-radius-lg)",
        fontFamily: "var(--tm-font-mono)", fontSize: 12.5, lineHeight: 1.75,
        color: "var(--tm-text-muted)", whiteSpace: "pre-wrap",
        minHeight: 360,
        transition: "border-color 200ms var(--tm-ease)",
      }}>{text}</pre>
    </div>
  )
}
