"use client"

interface Props {
  company: string | null
  title: string
  onConfirm: () => void
  onClose: () => void
}

export function DeleteConfirmDialog({ company, title, onConfirm, onClose }: Props) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,10,24,0.7)", backdropFilter: "blur(4px)", zIndex: 60 }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 61, width: "min(440px, 92vw)",
          background: "var(--tm-surface)", border: "1px solid var(--tm-border)",
          borderRadius: 14, padding: 24,
          display: "flex", flexDirection: "column", gap: 16,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-danger)" }}>
          Delete forever
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>
          Delete this application?
        </div>
        <div style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 500, color: "var(--tm-text)" }}>
            {company ? `${company} — ${title}` : title}
          </div>
          <div style={{ marginTop: 8 }}>
            Removes this row from your tracker and any match data. A public
            review you submitted for this company stays published.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 8,
              background: "transparent", border: "1px solid var(--tm-border)",
              color: "var(--tm-interactive-rest)", cursor: "pointer",
              fontSize: 13, fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 18px", borderRadius: 8,
              background: "var(--tm-danger)", border: "none",
              color: "white", cursor: "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            Delete forever
          </button>
        </div>
      </div>
    </>
  )
}
