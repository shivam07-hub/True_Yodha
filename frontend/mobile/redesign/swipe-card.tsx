"use client"

import { useRef, useState } from "react"
import type { MobileJobRow } from "./job-model"

/* ══════════════════════════════════════════════════════════════════════════
   SwipeCard — the handoff Jobs feed card: swipe-right = Save, swipe-left =
   Hide, tap = open detail. Reveals Save/Hide rails under the card while
   dragging; commits past a 96px threshold with a fly-out. Ported to the dot.

   The drag is driven IMPERATIVELY (writes transform + rail opacity straight
   to the DOM per pointermove via refs) so a finger drag never triggers a React
   re-render of the card subtree — reconciling logo + ring-SVG + chips + buttons
   at pointer rate is what made the swipe stutter. React state is used only for
   the commit fly-out lifecycle. Both animated properties stay composite-only
   (transform + opacity); will-change promotes a layer for the drag and is
   dropped the moment the card settles.
   ══════════════════════════════════════════════════════════════════════════ */

const CIRC = 103.7 // 2π·16.5 — the 40px card ring
const THRESH = 96
const SETTLE = "transform 260ms cubic-bezier(0.32,0.72,0,1)"

export function SwipeCard({
  row,
  first,
  hint,
  onOpen,
  onSave,
  onSkip,
  onShare,
  shared,
}: {
  row: MobileJobRow
  first: boolean
  hint: boolean
  onOpen: () => void
  onSave: () => void
  onSkip: () => void
  onShare: () => void
  shared: boolean
}) {
  const [leaving, setLeaving] = useState<"" | "right" | "left">("")

  const cardRef = useRef<HTMLDivElement | null>(null)
  const saveRailRef = useRef<HTMLDivElement | null>(null)
  const hideRailRef = useRef<HTMLDivElement | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<"" | "x" | "y">("")
  const dx = useRef(0)
  const suppressClick = useRef(false)

  // Write the drag frame straight to the DOM — no setState, no reconcile.
  const paint = (v: number) => {
    const card = cardRef.current
    if (card) card.style.transform = `translateX(${v}px) rotate(${(v * 0.012).toFixed(2)}deg)`
    if (saveRailRef.current) saveRailRef.current.style.opacity = v > 14 ? String(Math.min(v / THRESH, 1)) : "0"
    if (hideRailRef.current) hideRailRef.current.style.opacity = v < -14 ? String(Math.min(-v / THRESH, 1)) : "0"
  }

  const commit = (dir: "right" | "left") => {
    setLeaving(dir) // React paints the fly-out transform/transition once
    setTimeout(() => (dir === "right" ? onSave() : onSkip()), 190)
  }

  const onDown = (e: React.PointerEvent) => {
    if (leaving) return
    start.current = { x: e.clientX, y: e.clientY }
    axis.current = ""
    dx.current = 0
    suppressClick.current = false
    const card = cardRef.current
    if (card) {
      card.style.transition = "none"
      card.style.willChange = "transform"
    }
  }

  const onMove = (e: React.PointerEvent) => {
    if (!start.current || leaving) return
    const ddx = e.clientX - start.current.x
    const ddy = e.clientY - start.current.y
    if (!axis.current) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? "x" : "y"
      if (axis.current === "x") suppressClick.current = true
    }
    if (axis.current === "x") {
      e.preventDefault()
      dx.current = ddx
      paint(ddx)
    }
  }

  const settle = () => {
    const card = cardRef.current
    if (card) {
      card.style.transition = SETTLE
      // drop the promoted layer once the spring-back finishes
      const drop = () => { card.style.willChange = "auto"; card.removeEventListener("transitionend", drop) }
      card.addEventListener("transitionend", drop)
    }
    dx.current = 0
    paint(0)
  }

  const onUp = () => {
    if (axis.current === "x") {
      if (dx.current >= THRESH) return commit("right")
      if (dx.current <= -THRESH) return commit("left")
    }
    settle()
    axis.current = ""
    start.current = null
  }

  const anim = hint && first ? "mm-peekHint 1.7s cubic-bezier(0.32,0.72,0,1) 0.7s 1" : "mm-screenIn 260ms cubic-bezier(0.16,1,0.3,1) both"

  const shareIcon = shared ? (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--mm-good)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 7" /></svg>
  ) : (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4m0 0 4 4m-4-4L8 8" /><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>
  )

  return (
    <div style={{ position: "relative" }}>
      {/* rails — opacity written imperatively during drag; the fly-out keeps the committed rail lit */}
      <div ref={saveRailRef} style={{ position: "absolute", inset: 0, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "flex-start", padding: "0 18px", background: "var(--mm-accent-wash)", color: "var(--mm-accent)", fontSize: 13, fontWeight: 700, opacity: leaving === "right" ? 1 : 0 }}>★ Save</div>
      <div ref={hideRailRef} style={{ position: "absolute", inset: 0, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 18px", background: "rgba(251,113,133,0.09)", color: "var(--mm-bad)", fontSize: 13, fontWeight: 700, opacity: leaving === "left" ? 1 : 0 }}>Hide ✕</div>

      <div
        ref={cardRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => { if (!suppressClick.current) onOpen() }}
        style={{
          position: "relative", background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 16,
          padding: "13px 14px 11px", cursor: "pointer", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none",
          transform: leaving ? `translateX(${leaving === "right" ? 560 : -560}px) rotate(${leaving === "right" ? "6.72" : "-6.72"}deg)` : "translateX(0) rotate(0deg)",
          transition: leaving ? SETTLE : undefined,
          willChange: leaving ? "transform" : undefined,
          animation: anim,
        }}
      >
        <div style={{ display: "flex", gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: row.logoBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff", flex: "none" }}>{row.coInitial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--mm-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.co}</span>
              {row.hasGrade && <span style={{ fontSize: 10, fontWeight: 700, color: row.gradeFg, border: `1px solid ${row.gradeBd}`, borderRadius: 5, padding: "0.5px 4px", flex: "none" }}>{row.grade}</span>}
              {row.checkDetails && <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--mm-warn)", flex: "none" }}>⚠ Check details</span>}
              <span style={{ fontSize: 11, color: "var(--mm-dim)", flex: "none", marginLeft: "auto" }}>{row.ago}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.28, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{row.role}</div>
            <div style={{ fontSize: 11.5, color: "var(--mm-faint)", marginTop: 3 }}>{row.metaLine}</div>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 44 }}>
            <div style={{ position: "relative", width: 40, height: 40 }}>
              <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true">
                <circle cx="20" cy="20" r="16.5" fill="none" stroke="var(--mm-border)" strokeWidth="3" />
                <circle cx="20" cy="20" r="16.5" fill="none" stroke={row.ringColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - row.fit / 100)} transform="rotate(-90 20 20)" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: "var(--mm-text)" }}>{row.fit}</div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: row.ringColor, textTransform: "uppercase", whiteSpace: "nowrap" }}>{row.verdict}</span>
          </div>
        </div>

        {row.chips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
            {row.chips.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>
                <span style={{ fontSize: 9 }}>{c.sym}</span>{c.name}
              </span>
            ))}
            {row.hasExtra && <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: "var(--mm-hair)", color: "var(--mm-faint)" }}>{row.extra}</span>}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          {row.move && <span style={{ fontSize: 12, fontWeight: 600, color: row.moveFg }}>{row.move}</span>}
          {row.verified && <span style={{ fontSize: 10.5, color: "var(--mm-dim)", marginLeft: 4 }}>· {row.verified}</span>}
          <div style={{ flex: 1 }} />
          <button onClick={(e) => { e.stopPropagation(); commit("left") }} aria-label="Not interested" className="mm-press-sm" style={iconBtn}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <button onClick={(e) => { e.stopPropagation(); onShare() }} aria-label="Share" className="mm-press-sm" style={iconBtn}>{shareIcon}</button>
          <button onClick={(e) => { e.stopPropagation(); commit("right") }} className="mm-press" style={{ height: 32, display: "flex", alignItems: "center", gap: 5, padding: "0 13px", borderRadius: 99, border: "none", background: "var(--mm-accent)", color: "var(--mm-accent-fg)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>★ Save</button>
        </div>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 99, border: "1px solid var(--mm-border)", background: "transparent",
  color: "var(--mm-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
}
