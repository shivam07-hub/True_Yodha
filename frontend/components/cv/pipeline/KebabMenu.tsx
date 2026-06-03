"use client"

import { useEffect, useRef, useState } from "react"

interface Props {
  onWithdraw: () => void
  onDelete: () => void
}

export function KebabMenu({ onWithdraw, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        title="More"
        style={{
          width: 26, height: 26, borderRadius: 6,
          background: "transparent", border: "1px solid transparent",
          color: "var(--tm-interactive-rest)", cursor: "pointer",
          fontSize: 16, lineHeight: 1, padding: 0, fontFamily: "inherit",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-interactive-rest)" }}
      >
        ⋯
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
            width: 200, background: "var(--tm-surface)",
            border: "1px solid var(--tm-border)", borderRadius: 10,
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            padding: 6,
          }}
        >
          <button
            onClick={() => { setOpen(false); onWithdraw() }}
            style={menuItemStyle("var(--tm-text)")}
          >
            Move to Withdrew →
          </button>
          <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "4px 0" }} />
          <button
            onClick={() => { setOpen(false); onDelete() }}
            style={menuItemStyle("var(--tm-danger)")}
          >
            Delete forever
          </button>
        </div>
      )}
    </div>
  )
}

function menuItemStyle(color: string): React.CSSProperties {
  return {
    width: "100%", textAlign: "left",
    padding: "8px 10px", borderRadius: 6,
    background: "transparent", border: "none",
    color, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
  }
}
