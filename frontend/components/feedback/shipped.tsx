"use client"

// Public roadmap surface. v1 ships a curated, hand-maintained list pulled from
// the team's recent changelog so the tab isn't empty when Shivam ships it.
// v2 will replace this with a real `shipped_changelog` table joined to
// `user_feedback.status='shipped'`.

import { CATEGORIES, type FeedbackCategory } from "./feedback-types"
import { CategoryGlyph } from "./category-glyph"

interface ShippedItem {
  id: string
  title: string
  category: FeedbackCategory
  ts: string
}

const SHIPPED_ITEMS: ShippedItem[] = [
  { id: "SH-22", title: "Inline CV-pointer edit on Skills cards", category: "idea", ts: "1d ago" },
  { id: "SH-21", title: "Universal Practice — XP builds across any tab", category: "idea", ts: "2d ago" },
  { id: "SH-20", title: "Stale-application warnings in the Tracker pill", category: "idea", ts: "5d ago" },
  { id: "SH-19", title: "Tabular numerals in the Score widget", category: "bug", ts: "9d ago" },
  { id: "SH-18", title: "Diary entries now auto-save on blur", category: "bug", ts: "14d ago" },
  { id: "SH-17", title: "Resume parsing supports LaTeX-exported PDFs", category: "idea", ts: "21d ago" },
]

export function Shipped() {
  return (
    <div className="fade-up">
      <div
        style={{
          padding: "14px 16px",
          marginBottom: 12,
          borderRadius: "var(--tm-radius-sm)",
          background: "var(--tm-success-wash)",
          border: "1px solid var(--tm-success)",
        }}
      >
        <div className="eyebrow" style={{ color: "var(--tm-success)" }}>What you helped build</div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
          Every dispatch is read by a human. A growing share of Myro&apos;s roadmap
          starts as a user signal.
        </div>
      </div>

      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div
          style={{
            position: "absolute",
            left: 7,
            top: 8,
            bottom: 8,
            width: 1,
            background: "var(--tm-border-soft)",
          }}
        />

        {SHIPPED_ITEMS.map((s) => {
          const c = CATEGORIES[s.category]
          return (
            <div key={s.id} style={{ position: "relative", padding: "10px 0 14px" }}>
              <span
                style={{
                  position: "absolute",
                  left: -22,
                  top: 14,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "var(--tm-bg)",
                  border: "1.5px solid var(--tm-success)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--tm-success)",
                  fontSize: 8,
                  fontWeight: 800,
                }}
              >
                ✓
              </span>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      className="mono"
                      style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.06em" }}
                    >
                      {s.id}
                    </span>
                    <span style={{ color: c.color, transform: "scale(0.75)", display: "inline-flex" }}>
                      <CategoryGlyph category={s.category} />
                    </span>
                    <span className="eyebrow" style={{ color: c.color }}>{c.label}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "var(--tm-text)", fontWeight: 500 }}>
                    {s.title}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "var(--tm-text-faint)" }}>
                    Shipped {s.ts}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
