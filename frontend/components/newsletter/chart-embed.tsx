"use client"

interface ChartEmbedProps {
  src: string
  title: string
  height?: number
}

export function ChartEmbed({ src, title, height = 480 }: ChartEmbedProps) {
  return (
    <figure
      className="nl-fig nl-data"
      style={{ margin: "2.5rem 0", overflow: "hidden" }}
    >
      <figcaption className="nl-eyebrow" style={{ padding: "10px 16px", borderBottom: "1px solid var(--tm-border)" }}>
        {title}
      </figcaption>
      <iframe
        src={src}
        title={title}
        width="100%"
        height={height}
        style={{ display: "block", border: "none" }}
        loading="lazy"
      />
    </figure>
  )
}
