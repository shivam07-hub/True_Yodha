"use client"

import { useEffect, useRef } from "react"
import { APPLICATION_STAGES, APPLICATION_OUTCOMES } from "@/lib/api"
import type { ApplicationStatus } from "@/lib/api"
import { STAGE_LABEL, OUTCOME_LABEL } from "./useTrackerBoard"
import type { StageKey, OutcomeKey } from "./useTrackerBoard"

interface Props {
  current: ApplicationStatus
  onPick: (status: ApplicationStatus) => void
  onClose: () => void
  /** When true, render as bottom sheet (mobile). When false, render as anchored popover. */
  asSheet?: boolean
}

export function StatusPicker({ current, onPick, onClose, asSheet }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onEsc)
    }
  }, [onClose])

  const wrap: React.CSSProperties = asSheet
    ? {
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
        background: "var(--tm-surface)",
        borderTop: "1px solid var(--tm-border-soft)",
        borderRadius: "16px 16px 0 0",
        padding: "16px 20px 20px",
        paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
        maxHeight: "70vh", overflowY: "auto",
      }
    : {
        position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
        width: 260, background: "var(--tm-surface)",
        border: "1px solid var(--tm-border)", borderRadius: 12,
        boxShadow: "0 18px 60px rgba(0,0,0,0.5)",
        padding: 8,
      }

  return (
    <>
      {asSheet && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)" }} />
      )}
      <div ref={ref} style={wrap}>
        {asSheet && (
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--tm-border)", margin: "0 auto 16px" }} />
        )}
        <SectionHeader label="Stages" />
        {(APPLICATION_STAGES as StageKey[]).map(s => (
          <Row
            key={s}
            label={STAGE_LABEL[s]}
            marker="○"
            active={s === current}
            onClick={() => onPick(s)}
          />
        ))}
        <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "8px 0" }} />
        <SectionHeader label="Outcomes" />
        {(APPLICATION_OUTCOMES as OutcomeKey[]).map(o => (
          <Row
            key={o}
            label={OUTCOME_LABEL[o]}
            marker="◆"
            active={o === current}
            onClick={() => onPick(o)}
            terminal
          />
        ))}
      </div>
    </>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
      color: "var(--tm-text-faint)", padding: "8px 10px 6px",
    }}>
      {label}
    </div>
  )
}

function Row({
  label, marker, active, terminal, onClick,
}: { label: string; marker: string; active: boolean; terminal?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={active}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px", borderRadius: 8,
        background: active ? "var(--tm-accent-wash)" : "transparent",
        border: "1px solid transparent",
        color: active ? "var(--tm-accent)" : terminal ? "var(--tm-text-muted)" : "var(--tm-text)",
        cursor: active ? "default" : "pointer",
        textAlign: "left", fontSize: 14, fontFamily: "inherit",
        transition: "background 100ms ease",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent" }}
    >
      <span style={{ width: 14, color: active ? "var(--tm-accent)" : "var(--tm-text-faint)" }}>{marker}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {active && <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>current</span>}
    </button>
  )
}
