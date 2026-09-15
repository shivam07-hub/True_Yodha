import Link from "next/link"

export function CVPrerequisiteCard({
  readiness,
  errorCode,
}: {
  readiness: "missing" | "processing" | "failed"
  errorCode?: string | null
}) {
  const title =
    readiness === "processing"
      ? "Your CV analysis is running"
      : readiness === "failed"
        ? "CV analysis needs retry"
        : "Upload a CV to personalize Live Job Data"

  const body =
    readiness === "processing"
      ? "Mapping your skills. You can keep browsing."
      : readiness === "failed"
        ? "Re-upload your CV to restore the heatmap."
        : "Upload your CV to personalize the heatmap."

  return (
    <div
      style={{
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius-lg)",
        marginTop: 14,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: "var(--tm-fs-heading)", fontWeight: 600, color: "var(--tm-text)" }}>{title}</div>
      <div style={{ fontSize: "var(--tm-fs-body)", lineHeight: 1.6, color: "var(--tm-text-faint)", maxWidth: 720 }}>{body}</div>
      {readiness === "failed" && errorCode ? (
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-caption)", letterSpacing: "0.08em", color: "var(--tm-warning)" }}>
          LAST ERROR / {errorCode.toUpperCase()}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
        <Link
          href={readiness === "failed" ? "/cv?upload=1" : "/cv"}
          style={{
            padding: "8px 14px",
            borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-interactive)",
            color: "var(--tm-interactive-fg)",
            border: "1px solid var(--tm-interactive)",
            textDecoration: "none",
            fontSize: "var(--tm-fs-caption)",
            fontWeight: 600,
          }}
        >
          {readiness === "processing" ? "View upload status" : readiness === "failed" ? "Retry CV upload" : "Upload CV"}
        </Link>
        <Link
          href="/"
          style={{
            padding: "8px 14px",
            borderRadius: "var(--tm-radius-sm)",
            background: "transparent",
            color: "var(--tm-text-faint)",
            border: "1px solid var(--tm-border-soft)",
            textDecoration: "none",
            fontSize: "var(--tm-fs-caption)",
            fontWeight: 600,
          }}
        >
          See how Live Job Data works
        </Link>
      </div>
    </div>
  )
}
