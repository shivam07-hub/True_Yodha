import Image from "next/image"

interface ChartEmbedProps {
  src: string
  title: string
}

export function ChartEmbed({ src, title }: ChartEmbedProps) {
  const previewSrc = src.replace(/\.html$/, ".png")

  return (
    <figure
      className="nl-fig nl-data"
      style={{ margin: "2.5rem 0", overflow: "hidden" }}
    >
      <figcaption className="nl-eyebrow" style={{ padding: "10px 16px", borderBottom: "1px solid var(--tm-border)" }}>
        {title}
      </figcaption>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${title} — open interactive chart`}
        style={{ display: "block" }}
      >
        <Image
          src={previewSrc}
          alt={title}
          width={1200}
          height={480}
          unoptimized
          loading="lazy"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </a>
    </figure>
  )
}
