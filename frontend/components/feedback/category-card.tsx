import { CATEGORIES, type FeedbackCategory } from "./feedback-types"
import { CategoryGlyph } from "./category-glyph"

export function CategoryCard({
  category,
  active,
  onClick,
}: {
  category: FeedbackCategory
  active: boolean
  onClick: () => void
}) {
  const c = CATEGORIES[category]
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover-lift"
      aria-pressed={active}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "16px 14px 14px",
        background: active ? c.wash : "transparent",
        border: `1px solid ${active ? c.color : "var(--tm-border-soft)"}`,
        borderRadius: "var(--tm-radius)",
        cursor: "pointer",
        textAlign: "left",
        color: active ? c.color : "var(--tm-text-muted)",
        boxShadow: active ? `inset 0 0 0 1px ${c.color}, 0 0 16px ${c.wash}` : "none",
        position: "relative",
        transition: "all 180ms var(--tm-ease)",
        fontFamily: "inherit",
      }}
    >
      <div style={{ filter: active ? `drop-shadow(0 0 5px ${c.color}66)` : "none" }}>
        <CategoryGlyph category={category} />
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 14,
          fontWeight: 600,
          color: active ? c.color : "var(--tm-text)",
        }}
      >
        {c.label}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: "var(--tm-text-faint)", lineHeight: 1.4 }}>
        {c.hint}
      </div>
      {active && (
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: c.color,
            boxShadow: `0 0 6px ${c.color}`,
          }}
        />
      )}
    </button>
  )
}
