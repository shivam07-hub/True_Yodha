"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import type { CartSkill } from "@/types/xp"
import type { DiaryEntry } from "@/lib/forge-helpers"

interface DiaryPanelProps {
  open: boolean
  onClose: () => void
  cartSkills: CartSkill[]
  onAddSkill: (skill: CartSkill) => void
  onRemoveSkill: (skillName: string) => void
  gapSkills: Array<{ skill: string; user_level: number; required_level: number }>
  activeCompany?: string | null
  onSubmit: (entryText: string, cartSkills: CartSkill[]) => Promise<void>
  recentEntries: DiaryEntry[]
}

export function DiaryPanel({
  open,
  onClose,
  cartSkills,
  onAddSkill,
  onRemoveSkill,
  gapSkills,
  activeCompany,
  onSubmit,
  recentEntries,
}: DiaryPanelProps) {
  const [entryText, setEntryText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 120)
    }
  }, [open])

  async function handleSubmit() {
    const text = entryText.trim()
    if (!text || submitting) return
    try {
      setSubmitting(true)
      await onSubmit(text, cartSkills)
      setEntryText("")
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  const panel = (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: "calc(var(--z-modal) - 1)" as never,
            background: "rgba(5,10,24,0.55)", backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 320, zIndex: "var(--z-modal)" as never,
        background: "var(--tm-surface)",
        borderLeft: "1px solid var(--tm-border-soft)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 280ms var(--tm-ease)",
        boxShadow: open ? "-12px 0 48px rgba(0,0,0,0.4)" : "none",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--tm-border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--tm-text-faint)" }}>
            ◈ JOURNAL
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--tm-text-faint)", fontSize: 16, cursor: "pointer", padding: "2px 6px", lineHeight: 1, borderRadius: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Zone 1 — Journal */}
          <div style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>
              Today&apos;s thoughts
            </div>
            <textarea
              ref={textareaRef}
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              placeholder="Vent, reflect, celebrate — what's going on with your search today?"
              style={{
                width: "100%", minHeight: 100, resize: "none",
                background: "var(--tm-surface-2)", border: "1px solid var(--tm-border)",
                borderRadius: "var(--tm-radius-sm)", color: "var(--tm-text)",
                fontSize: 13, lineHeight: 1.65, padding: "10px 12px",
                fontFamily: "inherit", outline: "none",
                transition: "border-color var(--tm-dur) var(--tm-ease)",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--tm-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--tm-border)")}
            />
          </div>

          {/* Divider + Zone 2 — Skill cart */}
          <div style={{ margin: "0 18px", borderTop: "1px solid var(--tm-border-soft)", paddingTop: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
              Skill cart · Skills to forge this week
            </div>

            {cartSkills.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--tm-text-faint)", padding: "8px 0" }}>
                No skills in cart — add from gaps below
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                {cartSkills.map((skill) => (
                  <div key={skill.skill_name} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", borderRadius: "var(--tm-radius-sm)",
                    background: "rgba(0,245,212,0.05)", border: "1px solid var(--tm-accent-ring)",
                  }}>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--tm-text)", fontWeight: 500 }}>{skill.skill_name}</span>
                    <span style={{ fontSize: 10, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", flexShrink: 0 }}>
                      L{skill.level_from}→L{skill.level_to}
                    </span>
                    <button
                      onClick={() => onRemoveSkill(skill.skill_name)}
                      style={{ background: "none", border: "none", color: "var(--tm-text-faint)", cursor: "pointer", fontSize: 12, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Quick-add from gaps */}
            {gapSkills.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginBottom: 6 }}>
                  Add from gaps{activeCompany ? ` — ${activeCompany}` : ""}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {gapSkills.slice(0, 5).map((g) => {
                    const inCart = cartSkills.some((s) => s.skill_name === g.skill)
                    return (
                      <button
                        key={g.skill}
                        onClick={() => !inCart && onAddSkill({ skill_name: g.skill, level_from: g.user_level, level_to: g.required_level, company: activeCompany ?? undefined })}
                        style={{
                          padding: "4px 10px", borderRadius: 999, fontSize: 11, fontFamily: "inherit", cursor: inCart ? "default" : "pointer",
                          background: inCart ? "rgba(0,245,212,0.08)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${inCart ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                          color: inCart ? "var(--tm-accent)" : "var(--tm-text-faint)",
                        }}
                      >
                        {inCart ? "✓ " : "+ "}{g.skill}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div style={{ padding: "16px 18px" }}>
            <button
              onClick={handleSubmit}
              disabled={!entryText.trim() || submitting}
              style={{
                width: "100%", padding: "11px 0", borderRadius: "var(--tm-radius)",
                background: entryText.trim() ? "var(--tm-accent)" : "rgba(255,255,255,0.06)",
                border: "none", color: entryText.trim() ? "var(--tm-accent-fg)" : "var(--tm-text-faint)",
                fontSize: 13, fontWeight: 700, cursor: entryText.trim() && !submitting ? "pointer" : "default",
                fontFamily: "inherit", transition: "all var(--tm-dur) var(--tm-ease)",
                boxShadow: entryText.trim() ? "0 0 16px rgba(0,245,212,0.25)" : "none",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Saving…" : "Log entry · earn +30 XP"}
            </button>
          </div>

          {/* Past entries */}
          {recentEntries.length > 0 && (
            <div style={{ padding: "0 18px 20px", borderTop: "1px solid var(--tm-border-soft)", paddingTop: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                Recent entries
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentEntries.slice(0, 3).map((entry) => (
                  <div key={entry.id} style={{ padding: "10px 12px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }}>
                    <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginBottom: 4 }}>{entry.log_date}</div>
                    <p style={{ fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.55, margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as never }}>
                      {entry.entry_text}
                    </p>
                    {entry.skills_delta.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {entry.skills_delta.map((sd) => (
                          <span key={sd.taxonomy_key} style={{ padding: "1px 7px", borderRadius: 999, background: "rgba(0,245,212,0.06)", border: "1px solid var(--tm-accent-ring)", fontSize: 10, color: "var(--tm-accent)" }}>
                            {sd.taxonomy_key} +{sd.xp_added}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(panel, document.body)
}
