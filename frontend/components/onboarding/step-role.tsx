"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, Briefcase, ChartNetwork } from "lucide-react"
import { L2_CLUSTERS, MAX_TARGET_ROLES } from "@/lib/l2-clusters"

const CV_STAGES = [
  { id: "reading",  label: "Reading your CV",           sub: "Parsing document structure and text",       icon: Bot },
  { id: "skills",   label: "Extracting your skills",    sub: "Mapping evidence to the skill taxonomy",    icon: Briefcase },
  { id: "scoring",  label: "Computing your Myro Score", sub: "Ranking across 10 career domains",          icon: ChartNetwork },
]
// Advance stages at 8 s and 18 s into the ~29 s backend wait
const CV_STAGE_MS = [8000, 18000]

const PRESET_LOCATIONS = [
  "India (All)",
  "Bangalore",
  "Mumbai",
  "Delhi / NCR",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Kolkata",
  "Noida",
  "Gurgaon",
  "Remote",
]

const MAX_ROLES = MAX_TARGET_ROLES

interface Props {
  onNext: (roles: string[], location: string) => void
  loading: boolean
}

export function StepRole({ onNext, loading }: Props) {
  const [roles, setRoles] = useState<string[]>([])
  const [input, setInput] = useState("")
  const [location, setLocation] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [locFocused, setLocFocused] = useState(false)
  const [showCustomLoc, setShowCustomLoc] = useState(false)
  const [customLoc, setCustomLoc] = useState("")
  const [cvStage, setCvStage] = useState(0)
  const [dots, setDots] = useState(".")
  const inputRef = useRef<HTMLInputElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Advance CV analysis stage display while backend processes
  useEffect(() => {
    if (!loading) { setCvStage(0); return }
    const timers = CV_STAGE_MS.map((ms, i) =>
      setTimeout(() => setCvStage(i + 1), ms)
    )
    return () => timers.forEach(clearTimeout)
  }, [loading])

  // Animate the "..." busy indicator
  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 420)
    return () => clearInterval(id)
  }, [loading])

  const atMax = roles.length >= MAX_ROLES
  const canSubmit = roles.length > 0 && location.trim().length > 0 && !loading

  const suggestions = input.trim().length === 0 ? [] : L2_CLUSTERS.filter(
    (c) => c.toLowerCase().includes(input.toLowerCase()) &&
    !roles.map((r) => r.toLowerCase()).includes(c.toLowerCase())
  ).slice(0, 8)

  function selectCluster(cluster: string) {
    if (roles.length >= MAX_ROLES) return
    setRoles((r) => [...r, cluster])
    setInput("")
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  function removeRole(i: number) {
    setRoles((r) => r.filter((_, idx) => idx !== i))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (suggestions.length > 0) selectCluster(suggestions[0])
    }
    if (e.key === "Escape") setShowDropdown(false)
  }

  function handleBlur() {
    closeTimer.current = setTimeout(() => setShowDropdown(false), 150)
  }

  function handleDropdownMouseDown() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onNext(roles, location.trim())
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, width: "100%", maxWidth: 460 }}>

      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          display: "inline-block",
          fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--tm-accent)", marginBottom: 12,
          padding: "3px 10px", borderRadius: 999,
          background: "var(--tm-accent-wash)",
          border: "1px solid var(--tm-accent-ring)",
        }}>
          Step 2 of 3
        </div>
        <h2 style={{
          fontSize: "var(--tm-fs-title)", fontWeight: 700,
          color: "var(--tm-text)", marginBottom: 8, lineHeight: 1.2,
        }}>
          What roles are you targeting?
        </h2>
        <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
          Search and pick up to {MAX_ROLES} skill areas. We&apos;ll match your gaps against live job postings for each.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Role search */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
              Target skill area
            </label>
            <span style={{
              fontSize: 11, color: atMax ? "var(--tm-warning)" : "var(--tm-text-faint)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {roles.length} / {MAX_ROLES}
            </span>
          </div>

          {/* Input + dropdown wrapper */}
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); setShowDropdown(true) }}
              onKeyDown={handleKeyDown}
              onFocus={() => { setInputFocused(true); setShowDropdown(true) }}
              onBlur={() => { setInputFocused(false); handleBlur() }}
              placeholder={atMax ? "Max 3 selected" : "Search skill areas…"}
              disabled={atMax}
              autoComplete="off"
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "var(--tm-radius-sm)",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${inputFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                color: "var(--tm-text)",
                fontSize: "var(--tm-fs-meta)",
                fontFamily: "inherit",
                outline: "none",
                opacity: atMax ? 0.4 : 1,
                transition: "border-color var(--tm-dur) var(--tm-ease)",
                boxSizing: "border-box",
              }}
            />

            {/* Dropdown */}
            {showDropdown && suggestions.length > 0 && (
              <div
                onMouseDown={handleDropdownMouseDown}
                style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                  background: "var(--tm-surface, #0d0d12)",
                  border: "1px solid var(--tm-accent-ring)",
                  borderRadius: "var(--tm-radius-sm)",
                  overflow: "hidden",
                  zIndex: 50,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  maxHeight: 272,
                  overflowY: "auto",
                }}
              >
                {suggestions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => selectCluster(c)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--tm-border-soft)",
                      color: "var(--tm-text-muted)",
                      fontSize: 13, fontFamily: "inherit",
                      cursor: "pointer",
                      transition: "background var(--tm-dur)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-accent-wash)"; e.currentTarget.style.color = "var(--tm-accent)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected tags */}
          {roles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {roles.map((role, i) => (
                <div key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 8px 5px 12px",
                  borderRadius: 999,
                  background: "var(--tm-accent-wash)",
                  border: "1px solid var(--tm-accent-ring)",
                  fontSize: 13, color: "var(--tm-accent)",
                  animation: "tagIn 180ms var(--tm-ease) both",
                }}>
                  <span style={{ fontWeight: 500 }}>{role}</span>
                  <button
                    type="button"
                    onClick={() => removeRole(i)}
                    aria-label={`Remove ${role}`}
                    style={{
                      width: 16, height: 16, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,245,212,0.15)", border: "none", padding: 0,
                      cursor: "pointer", color: "var(--tm-accent)",
                      fontSize: 12, lineHeight: 1,
                      transition: "background var(--tm-dur)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,245,212,0.3)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,245,212,0.15)" }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
            Location
          </label>

          {/* Scrollable preset chips */}
          <div style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
            className="hide-scrollbar"
          >
            {PRESET_LOCATIONS.map((preset) => {
              const active = location === preset && !showCustomLoc
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setLocation(preset)
                    setShowCustomLoc(false)
                    setCustomLoc("")
                  }}
                  style={{
                    flexShrink: 0,
                    padding: "6px 13px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                    color: active ? "var(--tm-accent)" : "var(--tm-text-muted)",
                    transition: "all var(--tm-dur) var(--tm-ease)",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
                      e.currentTarget.style.color = "var(--tm-accent)"
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.borderColor = "var(--tm-border-soft)"
                      e.currentTarget.style.color = "var(--tm-text-muted)"
                    }
                  }}
                >
                  {preset}
                </button>
              )
            })}

            {/* Other chip */}
            <button
              type="button"
              onClick={() => {
                setShowCustomLoc(true)
                setLocation("")
              }}
              style={{
                flexShrink: 0,
                padding: "6px 13px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: showCustomLoc ? 600 : 500,
                fontFamily: "inherit",
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: showCustomLoc ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${showCustomLoc ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                color: showCustomLoc ? "var(--tm-accent)" : "var(--tm-text-muted)",
                transition: "all var(--tm-dur) var(--tm-ease)",
                outline: "none",
              }}
              onMouseEnter={(e) => {
                if (!showCustomLoc) {
                  e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
                  e.currentTarget.style.color = "var(--tm-accent)"
                }
              }}
              onMouseLeave={(e) => {
                if (!showCustomLoc) {
                  e.currentTarget.style.borderColor = "var(--tm-border-soft)"
                  e.currentTarget.style.color = "var(--tm-text-muted)"
                }
              }}
            >
              Other…
            </button>
          </div>

          {/* Custom location text input — shown only when "Other" is selected */}
          {showCustomLoc && (
            <input
              type="text"
              value={customLoc}
              onChange={(e) => {
                setCustomLoc(e.target.value)
                setLocation(e.target.value)
              }}
              onFocus={() => setLocFocused(true)}
              onBlur={() => setLocFocused(false)}
              placeholder="e.g. Singapore, London, Toronto…"
              autoFocus
              style={{
                padding: "11px 14px",
                borderRadius: "var(--tm-radius-sm)",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${locFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                color: "var(--tm-text)",
                fontSize: "var(--tm-fs-meta)",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color var(--tm-dur) var(--tm-ease)",
                animation: "tagIn 180ms var(--tm-ease) both",
              }}
            />
          )}
        </div>

        {roles.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.6, marginTop: -8 }}>
            Gap analysis will use live job postings for{" "}
            <span style={{ color: "var(--tm-accent)" }}>{roles.join(", ")}</span>
            {" "}to find what skills you need to close.
          </p>
        )}

        {loading ? (
          /* CV analysis loading panel — same icon-circle language as IntelLoadingState */
          <div
            role="status"
            aria-live="polite"
            aria-label={`Analysing CV — ${CV_STAGES[cvStage].label}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              padding: "20px 0 4px",
              animation: "loadIn 300ms var(--tm-ease) both",
            }}
          >
            {/* Icon circles — same pattern as IntelLoadingState */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }} aria-hidden="true">
              {CV_STAGES.map((stage, index) => {
                const Icon = stage.icon
                const active = index === cvStage
                return (
                  <div
                    key={stage.id}
                    title={stage.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                      background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
                      color: active ? "var(--tm-accent)" : "var(--tm-text-faint)",
                      transform: active ? "translateY(-2px) scale(1.05)" : "none",
                      opacity: active ? 1 : 0.55,
                      transition: "transform var(--tm-dur) var(--tm-ease), opacity var(--tm-dur) var(--tm-ease), color var(--tm-dur) var(--tm-ease), background var(--tm-dur) var(--tm-ease), border-color var(--tm-dur) var(--tm-ease)",
                    }}
                  >
                    <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                  </div>
                )
              })}
            </div>

            {/* Current stage label + sub */}
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text)", marginBottom: 3 }}>
                {CV_STAGES[cvStage].label}
              </p>
              <p style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>
                {CV_STAGES[cvStage].sub}
              </p>
            </div>

            {/* Spinner + dots */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="var(--tm-accent)" strokeWidth="2.2" strokeLinecap="round"
                aria-hidden="true"
                style={{ animation: "tm-spin-slow 1.8s linear infinite", flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="9" strokeOpacity="0.18" />
                <path d="M12 3a9 9 0 0 1 9 9" />
              </svg>
              <span style={{ fontSize: 12, color: "var(--tm-text-faint)", fontVariantNumeric: "tabular-nums" }}>
                {dots}
              </span>
            </div>

            {/* Honest timing hint */}
            <p style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.04em" }}>
              Usually takes 20–40 seconds
            </p>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              marginTop: 4, padding: "14px",
              borderRadius: "var(--tm-radius-sm)",
              background: canSubmit ? "var(--tm-accent)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${canSubmit ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
              color: canSubmit ? "var(--tm-bg)" : "var(--tm-text-faint)",
              fontSize: "var(--tm-fs-meta)", fontWeight: 700,
              cursor: canSubmit ? "pointer" : "default",
              fontFamily: "inherit",
              transition: "all var(--tm-dur) var(--tm-ease)",
              letterSpacing: "0.02em",
            }}
          >
            Get my Myro Score →
          </button>
        )}
      </form>

      <style>{`
        @keyframes tagIn {
          from { opacity: 0; transform: scale(0.85) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes loadIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tm-spin-slow {
          to { transform: rotate(360deg); }
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
