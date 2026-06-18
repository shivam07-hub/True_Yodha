import type { IssueDataset } from "@/lib/newsletter"

interface DatasetDownloadProps {
  slug: string
  dataset: IssueDataset
}

/**
 * Compact "download the data" strip. Sits in the value zone under the prose.
 * Points at the build-time CSV (/newsletter/{slug}/dataset.csv) and states the
 * CC BY 4.0 licence — the citable artifact AI engines and journalists link back
 * to (the AEO backlink lever).
 */
export function DatasetDownload({ slug, dataset }: DatasetDownloadProps) {
  return (
    <div
      className="nl-fig nl-callout"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, padding: "18px 22px" }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>
          {dataset.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginTop: 2 }}>
          Aggregate data · CSV · CC&nbsp;BY&nbsp;4.0 — reuse with attribution to Myro
        </div>
      </div>
      <a href={`/newsletter/${slug}/dataset.csv`} download className="nl-pill-ghost">
        Download CSV ↓
      </a>
    </div>
  )
}
