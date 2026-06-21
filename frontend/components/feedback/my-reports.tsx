"use client"

import { useQuery } from "@tanstack/react-query"
import { feedback as feedbackApi, type FeedbackReport, type FeedbackType } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import { CATEGORIES, type FeedbackCategory } from "./feedback-types"
import { CategoryGlyph } from "./category-glyph"
import { StatusPill } from "./status-pill"
import { formatDate } from "@/lib/format"

function isHubCategory(t: FeedbackType): t is FeedbackCategory {
  return t === "bug" || t === "idea" || t === "question" || t === "praise"
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  const day = 86400000
  const hour = 3600000
  if (diff < hour) return "just now"
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < day * 30) return `${Math.floor(diff / day)}d ago`
  return formatDate(iso, "medium")
}

function ReportRow({ r }: { r: FeedbackReport }) {
  const fallback: FeedbackCategory = "idea"
  const category: FeedbackCategory = isHubCategory(r.type) ? r.type : fallback
  const c = CATEGORIES[category]
  const payload = (r.payload ?? {}) as Record<string, unknown>
  const title = typeof payload.title === "string" && payload.title.length > 0
    ? payload.title
    : "(no title)"
  const severity =
    typeof payload.severity === "string" && payload.severity.length > 0
      ? (payload.severity as string)
      : null

  return (
    <div
      className="hover-lift"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "14px 16px",
        borderRadius: "var(--tm-radius-sm)",
        border: "1px solid var(--tm-border-soft)",
        background: "var(--tm-surface)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = c.color
        e.currentTarget.style.background = c.wash
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--tm-border-soft)"
        e.currentTarget.style.background = "var(--tm-surface)"
      }}
    >
      <div style={{ color: c.color, marginTop: 1, filter: `drop-shadow(0 0 4px ${c.color}66)` }}>
        <CategoryGlyph category={category} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.06em" }}
          >
            MR-{r.id}
          </span>
          <StatusPill status={r.status} />
          {severity && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--tm-font-mono)",
                color: severity === "blocker" ? "var(--tm-danger)" : "var(--tm-warning)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              · {severity}
            </span>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--tm-text)", fontWeight: 500 }}>
          {title}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--tm-text-faint)" }}>
          {formatRelative(r.created_at)}
        </div>
      </div>
    </div>
  )
}

export function MyReports() {
  const { token } = useAuth()
  const query = useQuery({
    queryKey: ["feedback-my"],
    queryFn: () => feedbackApi.listMine(token ?? "", 50),
    enabled: !!token,
    staleTime: 30_000,
  })

  const reports = query.data ?? []
  const shipped = reports.filter((r) => r.status === "shipped").length

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          marginBottom: 6,
          borderRadius: "var(--tm-radius-sm)",
          background: "var(--tm-int-bg-wash)",
          border: "1px solid var(--tm-int-border)",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div className="eyebrow" style={{ color: "var(--tm-interactive)" }}>Operator stats</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--tm-text)" }}>
            <span className="mono" style={{ color: "var(--tm-interactive)", fontWeight: 700 }}>
              {reports.length}
            </span>{" "}
            dispatch{reports.length === 1 ? "" : "es"} ·
            <span className="mono" style={{ color: "var(--tm-success)", fontWeight: 700 }}>
              {" "}{shipped}
            </span>{" "}
            shipped
          </div>
        </div>
        {reports.length > 0 && (
          <span
            style={{
              padding: "5px 10px",
              borderRadius: 99,
              background: "var(--tm-interactive)",
              color: "var(--tm-interactive-fg)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            SIGNAL CONTRIBUTOR
          </span>
        )}
      </div>

      {query.isLoading && (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
          Loading your dispatches…
        </div>
      )}

      {query.isError && (
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-danger-wash)",
            border: "1px solid var(--tm-danger)",
            color: "var(--tm-danger)",
            fontSize: 12,
          }}
        >
          Couldn&apos;t load your reports.
        </div>
      )}

      {query.isSuccess && reports.length === 0 && (
        <div
          style={{
            padding: "28px 16px",
            textAlign: "center",
            color: "var(--tm-text-faint)",
            border: "1px dashed var(--tm-border-soft)",
            borderRadius: "var(--tm-radius-sm)",
            fontSize: 12,
          }}
        >
          No dispatches yet. The first one earns you the Signal Contributor badge.

        </div>
      )}

      {reports.map((r) => <ReportRow key={r.id} r={r} />)}
    </div>
  )
}
