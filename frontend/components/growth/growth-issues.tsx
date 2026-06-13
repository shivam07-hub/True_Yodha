import type { GrowthContentAsset } from "@/lib/api"

export function GrowthIssues({ assets }: { assets: GrowthContentAsset[] }) {
  const issues = assets.filter((asset) => asset.kind === "newsletter")

  return (
    <section className="gc-tab-panel">
      <div className="gc-hint">
        Every published or drafted newsletter issue that feeds the distribution
        pipeline.
      </div>
      <div className="gc-issue-grid">
        {issues.map((issue) => (
          <article className="gc-issue-card" key={issue.id}>
            <h2>{issue.title}</h2>
            <div className="gc-slug">{issue.slug}</div>
            <p>{issue.summary || "No evidence summary captured yet."}</p>
            {issue.canonical_url ? (
              <a href={issue.canonical_url} target="_blank" rel="noreferrer">
                Open issue ↗
              </a>
            ) : null}
          </article>
        ))}
      </div>
      {issues.length === 0 ? (
        <div className="gc-empty">No newsletter issues have been imported.</div>
      ) : null}
    </section>
  )
}
