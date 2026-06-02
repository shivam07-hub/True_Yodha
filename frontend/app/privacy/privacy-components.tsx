import type { ReactNode, CSSProperties } from "react"

export const NAV = [
  { id: "who-we-are",      n: "01", title: "Who We Are" },
  { id: "what-we-collect", n: "02", title: "What We Collect & Why" },
  { id: "how-we-use",      n: "03", title: "How We Use Your Data" },
  { id: "who-we-share",    n: "04", title: "Who We Share Data With" },
  { id: "retention",       n: "05", title: "Data Retention" },
  { id: "your-rights",     n: "06", title: "Your Rights" },
  { id: "cookies",         n: "07", title: "Cookies" },
  { id: "security",        n: "08", title: "Security" },
  { id: "children",        n: "09", title: "Children" },
  { id: "changes",         n: "10", title: "Changes" },
  { id: "grievance",       n: "11", title: "Grievance Redressal" },
  { id: "contact",         n: "12", title: "Contact" },
] as const

export const muted: CSSProperties = {
  fontSize: "var(--tm-fs-body)",
  lineHeight: "var(--tm-lh-body)",
  color: "var(--tm-text-muted)",
  margin: 0,
}

export const tocLink: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 8px",
  borderRadius: "var(--tm-radius-sm)",
  color: "var(--tm-text-muted)",
  textDecoration: "none",
  fontSize: "var(--tm-fs-meta)",
  fontWeight: 500,
}

export const accentNum: CSSProperties = {
  color: "var(--tm-interactive)",
  minWidth: 22,
  flexShrink: 0,
}

export function Section({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      style={{
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderLeft: "3px solid var(--tm-interactive)",
        borderRadius: "var(--tm-radius-lg)",
        padding: "24px",
        scrollMarginTop: "32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)",
          color: "var(--tm-interactive)", fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {n}
        </span>
        <h2 style={{ margin: 0, fontSize: "var(--tm-fs-heading)", fontWeight: 600, letterSpacing: "var(--tm-tracking-tight)" }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

export function Li({ children }: { children: ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start", ...muted }}>
      <span style={{ color: "var(--tm-interactive)", flexShrink: 0, marginTop: 3 }}>›</span>
      <span>{children}</span>
    </li>
  )
}

export function Ul({ children }: { children: ReactNode }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
    </ul>
  )
}

export function Sub({ title }: { title: string }) {
  return (
    <p style={{ fontWeight: 600, color: "var(--tm-text)", fontSize: "var(--tm-fs-body)", margin: "16px 0 4px" }}>
      {title}
    </p>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ ...muted, marginBottom: 8 }}>{children}</p>
}
