"use client"

interface ChartEmbedProps {
  src: string
  title: string
  height?: number
}

export function ChartEmbed({ src, title, height = 480 }: ChartEmbedProps) {
  return (
    <div
      style={{
        margin: "28px 0",
        borderRadius: "var(--tm-radius-lg)",
        border: "1px solid var(--tm-border-soft)",
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--tm-text-faint)", padding: "8px 14px", borderBottom: "1px solid var(--tm-border-soft)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {title}
      </div>
      <iframe
        src={src}
        title={title}
        width="100%"
        height={height}
        style={{ display: "block", border: "none" }}
        loading="lazy"
      />
    </div>
  )
}
