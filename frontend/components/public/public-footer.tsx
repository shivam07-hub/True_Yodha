import Link from "next/link"

export function PublicFooter() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 12,
        padding: "10px 16px",
        borderTop: "1px solid var(--tm-border-soft)",
        flexShrink: 0,
      }}
    >
      <Link
        href="/privacy"
        style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none" }}
      >
        Privacy
      </Link>
      <span style={{ fontSize: 11, color: "var(--tm-text-faint)", opacity: 0.4 }}>·</span>
      <Link
        href="/newsletter"
        style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none" }}
      >
        Newsletter
      </Link>
      <span style={{ fontSize: 11, color: "var(--tm-text-faint)", opacity: 0.4 }}>·</span>
      <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>© Myro 2026</span>
    </div>
  )
}
