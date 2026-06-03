"use client"

import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

type PillTone = "muted" | "accent" | "success" | "danger" | "warning"

const basePill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  minHeight: 32,
  padding: "0 13px",
  borderRadius: 999,
  fontFamily: "var(--tm-font-mono)",
  fontSize: 12,
  fontWeight: 650,
  letterSpacing: "0.03em",
  whiteSpace: "nowrap",
  transition: "background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease), color var(--tm-dur-fast) var(--tm-ease), opacity var(--tm-dur-fast) var(--tm-ease)",
}

function restoreButtonStyles(
  el: HTMLElement,
  active: boolean,
  disabled?: boolean,
) {
  el.style.background = active ? "var(--tm-int-bg-wash)" : "rgba(255,255,255,0.025)"
  el.style.borderColor = active ? "var(--tm-int-border)" : "var(--tm-border)"
  el.style.color = active ? "var(--tm-interactive)" : "var(--tm-interactive-rest)"
  el.style.opacity = disabled ? "0.55" : "1"
}

export function StripLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--tm-font-mono)",
        fontSize: 11,
        letterSpacing: "0.11em",
        color: "var(--tm-text-faint)",
        textTransform: "uppercase",
        marginRight: 4,
      }}
    >
      {children}
    </span>
  )
}

export function SelectionChip({
  children,
  active,
  onClick,
  ariaLabel,
  alertDot,
}: {
  children: ReactNode
  active: boolean
  onClick: () => void
  ariaLabel: string
  alertDot?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className="tm-control-focus"
      style={{
        ...basePill,
        position: "relative",
        cursor: "pointer",
        background: active ? "var(--tm-int-bg-wash)" : "rgba(255,255,255,0.025)",
        border: `1.5px solid ${active ? "var(--tm-int-border)" : "var(--tm-border)"}`,
        color: active ? "var(--tm-interactive)" : "var(--tm-interactive-rest)",
        boxShadow: active ? "inset 0 0 0 1px var(--tm-int-border-soft)" : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--tm-int-bg-wash)"
        e.currentTarget.style.borderColor = "var(--tm-int-border)"
        e.currentTarget.style.color = "var(--tm-interactive)"
      }}
      onMouseLeave={(e) => restoreButtonStyles(e.currentTarget, active)}
    >
      {active && (
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--tm-interactive)", boxShadow: "0 0 6px var(--tm-int-bg-hover)" }}
        />
      )}
      {children}
      {alertDot && (
        <span
          aria-hidden="true"
          style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderRadius: "50%", background: "var(--tm-interactive)", boxShadow: "0 0 6px var(--tm-int-bg-hover)", border: "1.5px solid var(--tm-bg)" }}
        />
      )}
    </button>
  )
}

export function InfoPill({
  children,
  tone = "muted",
  style,
}: {
  children: ReactNode
  tone?: PillTone
  style?: CSSProperties
}) {
  const toneStyles: Record<PillTone, CSSProperties> = {
    muted: { background: "rgba(255,255,255,0.025)", borderColor: "var(--tm-border-soft)", color: "var(--tm-text-faint)" },
    accent: { background: "var(--tm-int-bg-wash)", borderColor: "var(--tm-int-border)", color: "var(--tm-interactive)" },
    success: { background: "rgba(74,222,128,0.08)", borderColor: "rgba(74,222,128,0.28)", color: "var(--tm-success)" },
    danger: { background: "rgba(251,113,133,0.07)", borderColor: "rgba(251,113,133,0.28)", color: "var(--tm-danger)" },
    warning: { background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.28)", color: "var(--tm-warning)" },
  }

  return (
    <span
      style={{
        ...basePill,
        minHeight: 24,
        padding: "0 9px",
        fontSize: 11,
        fontWeight: 600,
        border: "1px solid",
        ...toneStyles[tone],
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export function AddChip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="tm-control-focus"
      style={{
        ...basePill,
        minHeight: 32,
        textDecoration: "none",
        border: "1.5px dashed var(--tm-border)",
        background: "transparent",
        color: "var(--tm-text-faint)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--tm-interactive)"
        e.currentTarget.style.borderColor = "var(--tm-int-border)"
        e.currentTarget.style.background = "var(--tm-int-bg-wash)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--tm-text-faint)"
        e.currentTarget.style.borderColor = "var(--tm-border)"
        e.currentTarget.style.background = "transparent"
      }}
    >
      + {children}
    </Link>
  )
}

export function InlineActionPill({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="tm-control-focus"
      style={{
        ...basePill,
        minHeight: 30,
        padding: "0 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? "rgba(255,255,255,0.025)" : "var(--tm-int-bg-wash)",
        border: "1.5px solid var(--tm-int-border)",
        color: "var(--tm-interactive)",
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = "var(--tm-int-border-soft)"
        e.currentTarget.style.borderColor = "var(--tm-interactive)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = disabled ? "rgba(255,255,255,0.025)" : "var(--tm-int-bg-wash)"
        e.currentTarget.style.borderColor = "var(--tm-int-border)"
      }}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="tm-control-focus"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 999,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid var(--tm-border-soft)",
        cursor: "pointer",
        color: "var(--tm-text-faint)",
        fontSize: 13,
        padding: 0,
        fontFamily: "inherit",
        transition: "background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease), color var(--tm-dur-fast) var(--tm-ease)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(251,113,133,0.08)"
        e.currentTarget.style.borderColor = "rgba(251,113,133,0.35)"
        e.currentTarget.style.color = "var(--tm-danger)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.025)"
        e.currentTarget.style.borderColor = "var(--tm-border-soft)"
        e.currentTarget.style.color = "var(--tm-text-faint)"
      }}
    >
      {children}
    </button>
  )
}
