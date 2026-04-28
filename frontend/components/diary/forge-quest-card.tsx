"use client"

import { useState } from "react"

export interface QuestStep {
  n: number
  title: string
  description: string
  xpReward: number
  proofPrompt?: string
  done: boolean
  active: boolean
}

interface ForgeQuestCardProps {
  step: QuestStep
  onComplete: (proof: string) => void
  disabled?: boolean
}

export function ForgeQuestCard({ step, onComplete, disabled }: ForgeQuestCardProps) {
  const [proof, setProof] = useState("")
  const [claiming, setClaiming] = useState(false)

  const F = {
    ac: "#00F5D4", acw: "rgba(0,245,212,0.08)", acr: "rgba(0,245,212,0.25)",
    text: "#E8F0FF", muted: "#7A88A8", faint: "#3A4560",
    surf: "#0B1424", border: "#1A2540",
    grn: "#4ADE80", grnw: "rgba(74,222,128,0.12)",
  }

  async function handleClaim() {
    if (!proof.trim()) return
    setClaiming(true)
    await new Promise(r => setTimeout(r, 600))
    onComplete(proof)
    setClaiming(false)
  }

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1.5px solid ${step.done ? F.grn + "40" : step.active ? F.acr : F.border}`,
        background: step.done
          ? `${F.grnw}`
          : step.active
            ? `linear-gradient(135deg, ${F.acw}, rgba(0,0,0,0.06))`
            : "rgba(255,255,255,0.02)",
        padding: "14px 16px",
        cursor: step.done || disabled ? "default" : "pointer",
        transition: "all 200ms",
        opacity: disabled && !step.active && !step.done ? 0.4 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Quest badge */}
        <div style={{
          width: 34, height: 34, flexShrink: 0,
          borderRadius: "50%",
          background: step.done ? F.grn : step.active ? F.ac : "transparent",
          border: `2px solid ${step.done ? F.grn : step.active ? F.ac : F.faint}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: step.done ? 16 : 13,
          fontWeight: 700,
          color: step.done || step.active ? "#050A18" : F.faint,
          boxShadow: step.active ? `0 0 16px ${F.ac}40` : step.done ? `0 0 12px ${F.grn}30` : "none",
          transition: "all 300ms",
          flexDirection: "column",
        }}>
          {step.done ? "✓" : step.n}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: step.done ? F.grn : step.active ? F.text : F.muted }}>
              {step.title}
            </div>
            <div style={{
              fontSize: 11, fontWeight: 700,
              color: step.done ? F.grn : F.ac,
              padding: "2px 8px", borderRadius: 99,
              background: step.done ? F.grnw : F.acw,
              border: `1px solid ${step.done ? F.grn + "40" : F.acr}`,
              flexShrink: 0,
            }}>
              {step.done ? `+${step.xpReward} XP` : `+${step.xpReward} XP`}
            </div>
          </div>

          <div style={{ fontSize: 12, color: F.faint, lineHeight: 1.5, marginBottom: step.active ? 12 : 0 }}>
            {step.description}
          </div>

          {/* Active step: XP fill bar animation */}
          {step.active && (
            <div style={{ height: 3, background: F.border, borderRadius: 99, overflow: "hidden", marginBottom: 12 }}>
              <div
                style={{
                  height: "100%", width: proof.trim() ? "85%" : "40%",
                  background: `linear-gradient(90deg, ${F.acr}, ${F.ac})`,
                  borderRadius: 99,
                  boxShadow: `0 0 8px ${F.ac}60`,
                  transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
          )}

          {/* Proof input */}
          {step.active && !step.done && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                value={proof}
                onChange={e => setProof(e.target.value)}
                placeholder={step.proofPrompt ?? "Paste a link, description, or screenshot URL…"}
                style={{
                  width: "100%", padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${proof.trim() ? F.acr : F.border}`,
                  color: F.text, fontSize: 12, lineHeight: 1.6,
                  resize: "none", minHeight: 64, fontFamily: "inherit",
                  outline: "none", boxSizing: "border-box",
                  transition: "border-color 200ms",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 11, color: F.muted }}>
                  {proof.trim() ? (
                    <span style={{ color: F.ac }}>✓ Ready to claim XP</span>
                  ) : (
                    "Log your proof to complete this quest"
                  )}
                </div>
                <button
                  onClick={handleClaim}
                  disabled={!proof.trim() || claiming || !!disabled}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    background: proof.trim() ? F.ac : F.border,
                    border: "none",
                    color: proof.trim() ? "#050A18" : F.faint,
                    fontSize: 13, fontWeight: 700,
                    cursor: proof.trim() ? "pointer" : "not-allowed",
                    fontFamily: "inherit",
                    transition: "all 200ms",
                    boxShadow: proof.trim() ? `0 0 16px ${F.ac}40` : "none",
                  }}
                >
                  {claiming ? "Claiming…" : "✓ Complete & Claim XP"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
