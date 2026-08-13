"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CloseButton } from "@/components/ui/close-button"

const STAGE_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
}

interface ReviewModalProps {
  company: string | null
  defaultStage?: string
  onClose: () => void
  onSubmit: (data: { star_rating: number; last_stage: string; written_note?: string | null }) => Promise<void>
}

export function ReviewModal({ company, defaultStage, onClose, onSubmit }: ReviewModalProps) {
  const [stars, setStars] = useState(0)
  const [hoveredStar, setHoveredStar] = useState(0)
  const [lastStage, setLastStage] = useState(defaultStage && STAGE_LABELS[defaultStage] ? defaultStage : "applied")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (stars === 0) { setError("Pick a star rating"); return }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({ star_rating: stars, last_stage: lastStage, written_note: note.trim() || null })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed")
      setSubmitting(false)
    }
  }

  const displayStar = hoveredStar || stars

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,10,24,0.7)", backdropFilter: "blur(4px)", zIndex: 60 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 61, width: "min(480px,92vw)", background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)", borderRadius: 14, padding: 28, display: "flex", flexDirection: "column", gap: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 40px var(--tm-int-bg-wash)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 4 }}>Leave a review</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--tm-text)" }}>{company ?? "Company"}</div>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginBottom: 8 }}>Overall experience</div>
          <div style={{ display: "flex", gap: 6 }} onMouseLeave={() => setHoveredStar(0)}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onMouseEnter={() => setHoveredStar(n)}
                onClick={() => setStars(n)}
                style={{ fontSize: 28, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: n <= displayStar ? "#FBBF24" : "var(--tm-border)", transition: "color 80ms ease" }}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginBottom: 8 }}>How far did you get?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(STAGE_LABELS).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setLastStage(val)}
                style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", cursor: "pointer", transition: "all 100ms ease", background: lastStage === val ? "var(--tm-interactive)" : "rgba(255,255,255,0.03)", border: lastStage === val ? "1px solid var(--tm-interactive)" : "1px solid var(--tm-border)", color: lastStage === val ? "var(--tm-interactive-fg)" : "var(--tm-interactive-rest)" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginBottom: 8 }}>Note <span style={{ opacity: 0.5 }}>(optional)</span></div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="What happened? Anything others should know..."
            style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--tm-border)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--tm-text)", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {error && <div style={{ fontSize: 12, color: "var(--tm-danger)" }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="dismiss" size="sm" onClick={onClose}>Skip</Button>
          <Button variant="solid" size="sm" onClick={handleSubmit} disabled={submitting || stars === 0}>
            {submitting ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </div>
    </>
  )
}
