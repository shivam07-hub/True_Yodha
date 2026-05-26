"use client"

interface ShareButtonProps {
  url: string
  title: string
}

export function ShareButton({ url, title }: ShareButtonProps) {
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url).catch(() => {})
    }
  }

  return (
    <button
      onClick={handleShare}
      aria-label="Share this article"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        color: "var(--tm-text-muted)",
        background: "transparent",
        border: "1px solid var(--tm-border)",
        padding: "6px 14px",
        borderRadius: "var(--tm-radius)",
        cursor: "pointer",
        fontFamily: "var(--tm-font-sans)",
        transition: "color var(--tm-dur) var(--tm-ease), border-color var(--tm-dur) var(--tm-ease), background var(--tm-dur) var(--tm-ease)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--tm-interactive)"
        e.currentTarget.style.borderColor = "var(--tm-interactive)"
        e.currentTarget.style.background = "var(--tm-int-bg-wash)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--tm-text-muted)"
        e.currentTarget.style.borderColor = "var(--tm-border)"
        e.currentTarget.style.background = "transparent"
      }}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <circle cx="10.5" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="10.5" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="2.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 5.8L9.1 3.2M4 7.2L9.1 9.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      Share
    </button>
  )
}
