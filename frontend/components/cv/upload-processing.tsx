"use client"

import { useEffect, useState } from "react"

const STAGES = [
  { id: "received",   label: "CV received",        sub: "Your document is in — reading it now" },
  { id: "extracting", label: "Extracting skills",   sub: "Mapping evidence to the skill taxonomy" },
  { id: "scoring",    label: "Computing your score", sub: "Ranking across all career domains" },
]

// Advance stages across the real ~29s window (LLM call dominates)
const STAGE_MS = [7000, 20000]

type StageStatus = "pending" | "active" | "done"

interface Props {
  success?: boolean
  result?: { skills_detected: number; score: number }
}

export function CVUploadProcessing({ success, result }: Props) {
  const [stage, setStage] = useState(0)
  const [dots, setDots] = useState(".")

  // Advance through stages while still uploading
  useEffect(() => {
    if (success) { setStage(STAGES.length); return }
    const timers = STAGE_MS.map((ms, i) =>
      setTimeout(() => setStage(i + 1), ms)
    )
    return () => timers.forEach(clearTimeout)
  }, [success])

  // Animate the "···" busy indicator
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 420)
    return () => clearInterval(id)
  }, [])

  const stageStatus = (i: number): StageStatus => {
    const effective = success ? STAGES.length : stage
    if (i < effective) return "done"
    if (i === effective) return "active"
    return "pending"
  }

  return (
    <div
      role="status"
        aria-live="polite"
        aria-label={success ? `Upload complete. ${result?.skills_detected} skills detected.` : `Processing CV — stage ${stage + 1} of ${STAGES.length}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          padding: "8px 0 4px",
          animation: "tm-fade-up 300ms ease both",
          width: "100%",
        }}
      >
        {/* Icon + pulsing ring */}
        <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
          {/* Outer pulse ring */}
          {!success && (
            <div
              className="tm-pulse-ring"
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: -10,
                borderRadius: "50%",
                border: "2px solid var(--tm-interactive)",
                animation: "tm-pulse-ring 1.6s ease-out infinite",
              }}
            />
          )}
          {/* Icon circle */}
          <div
            aria-hidden="true"
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: success ? "var(--tm-int-bg-wash)" : "rgba(255,255,255,0.04)",
              border: `1.5px solid ${success ? "var(--tm-interactive)" : "var(--tm-int-border)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 600ms ease",
              boxShadow: success ? "0 0 24px var(--tm-int-bg-hover)" : "none",
            }}
          >
            {success ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--tm-interactive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline
                  points="4 13 9 18 20 7"
                  strokeDasharray="24"
                  strokeDashoffset="0"
                  style={{ animation: "tm-check-draw 400ms ease 80ms both" }}
                />
              </svg>
            ) : (
              <svg
                className="tm-spinner"
                width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke="var(--tm-interactive)" strokeWidth="2" strokeLinecap="round"
                aria-hidden="true"
                style={{ animation: "tm-spin-slow 1.8s linear infinite" }}
              >
                <circle cx="12" cy="12" r="9" strokeOpacity="0.18" />
                <path d="M12 3a9 9 0 0 1 9 9" />
              </svg>
            )}
          </div>
        </div>

        {/* Headline */}
        <div style={{ textAlign: "center" }}>
          <p style={{
            fontSize: "var(--tm-fs-body)",
            fontWeight: 600,
            color: "var(--tm-text)",
            marginBottom: 6,
            letterSpacing: "var(--tm-tracking-tight)",
          }}>
            {success
              ? `${result?.skills_detected} skills found · Score ${result?.score?.toFixed(1)}`
              : STAGES[Math.min(stage, STAGES.length - 1)].label
            }
          </p>
          <p style={{
            fontSize: "var(--tm-fs-meta)",
            color: "var(--tm-text-muted)",
            lineHeight: 1.5,
          }}>
            {success
              ? "Your Main CV is set. Loading your profile…"
              : STAGES[Math.min(stage, STAGES.length - 1)].sub
            }
          </p>
        </div>

        {/* Stage steps */}
        <div style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          borderRadius: "var(--tm-radius)",
          border: "1px solid var(--tm-border-soft)",
          overflow: "hidden",
        }}>
          {STAGES.map((s, i) => {
            const status = stageStatus(i)
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: status === "active"
                    ? "var(--tm-int-bg-wash)"
                    : "transparent",
                  borderBottom: i < STAGES.length - 1 ? "1px solid var(--tm-border-soft)" : "none",
                  transition: "background 400ms ease",
                }}
              >
                {/* Status dot */}
                <div style={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {status === "done" && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="7" fill="var(--tm-interactive)" fillOpacity="0.15" />
                      <polyline points="4.5 8.5 7 11 11.5 6" stroke="var(--tm-interactive)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {status === "active" && (
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: "var(--tm-interactive)",
                      boxShadow: "0 0 6px var(--tm-int-bg-hover)",
                    }} aria-hidden="true" />
                  )}
                  {status === "pending" && (
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: "var(--tm-border)",
                    }} aria-hidden="true" />
                  )}
                </div>

                {/* Label */}
                <span style={{
                  fontSize: "var(--tm-fs-meta)",
                  color: status === "pending" ? "var(--tm-text-faint)" : "var(--tm-text)",
                  flex: 1,
                  transition: "color 300ms ease",
                }}>
                  {s.label}
                </span>

                {/* Right indicator */}
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "0.05em",
                    color: status === "done"
                      ? "var(--tm-interactive)"
                      : status === "active"
                        ? "var(--tm-text-muted)"
                        : "transparent",
                    minWidth: 28,
                    textAlign: "right",
                    transition: "color 300ms ease",
                  }}
                >
                  {status === "done" ? "done" : status === "active" ? dots : "—"}
                </span>
              </div>
            )
          })}
        </div>

        <p
          aria-hidden="true"
          style={{
            fontSize: 11,
            color: "var(--tm-text-faint)",
            letterSpacing: "0.04em",
          }}
        >
          {success ? "All done" : "Usually takes 20–30 seconds"}
        </p>
    </div>
  )
}
