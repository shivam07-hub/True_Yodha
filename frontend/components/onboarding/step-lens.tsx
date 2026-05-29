"use client"

import { useRef, useState } from "react"

export interface LensFields {
  deal_breakers: string[]
  career_goal: string | null
  superpower: string | null
}

interface Props {
  onNext: (fields: LensFields) => void
  onSkip: () => void
  loading: boolean
}

const MAX_DEAL_BREAKERS = 6

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "11px 14px",
  borderRadius: "var(--tm-radius-sm)",
  background: "rgba(255,255,255,0.03)",
  border: `1px solid ${focused ? "var(--tm-int-border)" : "var(--tm-border-soft)"}`,
  color: "var(--tm-text)",
  fontSize: "var(--tm-fs-meta)",
  fontFamily: "inherit",
  outline: "none",
  transition: "border-color var(--tm-dur) var(--tm-ease)",
  boxSizing: "border-box",
})

export function StepLens({ onNext, onSkip, loading }: Props) {
  const [dealBreakers, setDealBreakers] = useState<string[]>([])
  const [dbInput, setDbInput] = useState("")
  const [careerGoal, setCareerGoal] = useState("")
  const [superpower, setSuperpower] = useState("")
  const [focused, setFocused] = useState<string | null>(null)
  const dbRef = useRef<HTMLInputElement>(null)

  const atMax = dealBreakers.length >= MAX_DEAL_BREAKERS

  function addDealBreaker() {
    const v = dbInput.trim()
    if (!v || atMax) return
    if (dealBreakers.some((d) => d.toLowerCase() === v.toLowerCase())) {
      setDbInput("")
      return
    }
    setDealBreakers((d) => [...d, v])
    setDbInput("")
    dbRef.current?.focus()
  }

  function removeDealBreaker(i: number) {
    setDealBreakers((d) => d.filter((_, idx) => idx !== i))
  }

  function handleDbKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addDealBreaker()
    }
  }

  function submit() {
    onNext({
      deal_breakers: dealBreakers,
      career_goal: careerGoal.trim() || null,
      superpower: superpower.trim() || null,
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, width: "100%", maxWidth: 460 }}>
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          display: "inline-block",
          fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--tm-interactive)", marginBottom: 12,
          padding: "3px 10px", borderRadius: 999,
          background: "var(--tm-int-bg-wash)",
          border: "1px solid var(--tm-int-border)",
        }}>
          Optional · sharpen matches
        </div>
        <h2 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", marginBottom: 8, lineHeight: 1.2 }}>
          What makes a job right for you?
        </h2>
        <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
          Myro&apos;s match brain uses this to grade fit and write your &ldquo;how to position&rdquo; angle. Skip anytime — you can add it later.
        </p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit() }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Deal-breakers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
              Deal-breakers
            </label>
            <span style={{ fontSize: 11, color: atMax ? "var(--tm-warning)" : "var(--tm-text-faint)", fontVariantNumeric: "tabular-nums" }}>
              {dealBreakers.length} / {MAX_DEAL_BREAKERS}
            </span>
          </div>
          <input
            ref={dbRef}
            type="text"
            value={dbInput}
            onChange={(e) => setDbInput(e.target.value)}
            onKeyDown={handleDbKeyDown}
            onFocus={() => setFocused("db")}
            onBlur={() => setFocused(null)}
            placeholder={atMax ? "Max reached" : "e.g. no relocation, no pure coding — Enter to add"}
            disabled={atMax}
            autoComplete="off"
            style={{ ...inputStyle(focused === "db"), opacity: atMax ? 0.4 : 1 }}
          />
          {dealBreakers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {dealBreakers.map((d, i) => (
                <div key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 8px 5px 12px", borderRadius: 999,
                  background: "var(--tm-danger-wash)", border: "1px solid rgba(251,113,133,0.3)",
                  fontSize: 13, color: "var(--tm-danger)",
                }}>
                  <span style={{ fontWeight: 500 }}>{d}</span>
                  <button
                    type="button"
                    onClick={() => removeDealBreaker(i)}
                    aria-label={`Remove ${d}`}
                    style={{
                      width: 16, height: 16, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(251,113,133,0.2)", border: "none", padding: 0,
                      cursor: "pointer", color: "var(--tm-danger)", fontSize: 12, lineHeight: 1,
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Career goal */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
            Career goal
          </label>
          <input
            type="text"
            value={careerGoal}
            onChange={(e) => setCareerGoal(e.target.value)}
            onFocus={() => setFocused("goal")}
            onBlur={() => setFocused(null)}
            placeholder="e.g. move from analyst into product strategy in 2 years"
            style={inputStyle(focused === "goal")}
          />
        </div>

        {/* Superpower */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
            Your superpower
          </label>
          <input
            type="text"
            value={superpower}
            onChange={(e) => setSuperpower(e.target.value)}
            onFocus={() => setFocused("super")}
            onBlur={() => setFocused(null)}
            placeholder="e.g. turning messy data into decisions execs act on"
            style={inputStyle(focused === "super")}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onSkip}
            disabled={loading}
            style={{
              flex: "0 0 auto", padding: "14px 18px",
              borderRadius: "var(--tm-radius-sm)",
              background: "transparent",
              border: "1px solid var(--tm-border-soft)",
              color: "var(--tm-text-muted)",
              fontSize: "var(--tm-fs-meta)", fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              fontFamily: "inherit",
              transition: "all var(--tm-dur) var(--tm-ease)",
            }}
          >
            Skip
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1, padding: "14px",
              borderRadius: "var(--tm-radius-sm)",
              background: "var(--tm-interactive)",
              border: "1px solid var(--tm-interactive)",
              color: "var(--tm-bg)",
              fontSize: "var(--tm-fs-meta)", fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              fontFamily: "inherit",
              transition: "all var(--tm-dur) var(--tm-ease)",
              letterSpacing: "0.02em",
            }}
          >
            {loading ? "Saving…" : "Continue →"}
          </button>
        </div>
      </form>
    </div>
  )
}
