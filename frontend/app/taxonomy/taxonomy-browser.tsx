"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { formatCount } from "@/lib/format"
import { demandBandDisplay } from "@/lib/demand-band"
import { SectionGate } from "@/components/loading/section-gate"
import { AccentField } from "@/components/loading/accent-field"
import { useTaxonomy } from "@/lib/taxonomy/use-taxonomy"
import type { DemandBand } from "@/lib/api"
import "./taxonomy.css"

const LEAD_COUNT = 40

/** Demand badge — reuses the one DemandBand vocabulary (lib/demand-band.ts). */
function DemandBadge({ band }: { band: DemandBand | null }) {
  const d = demandBandDisplay(band ?? undefined)
  if (!d) return null
  return <span className={`tx-demand-badge tx-demand-badge--${d.tone}`}>{d.label}</span>
}

export function TaxonomyBrowser() {
  const tx = useTaxonomy()
  const { readiness, stats } = tx

  const [query, setQuery] = useState("")
  const [debQuery, setDebQuery] = useState("")
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(60)

  useEffect(() => {
    const id = setTimeout(() => setDebQuery(query), 220)
    return () => clearTimeout(id)
  }, [query])
  useEffect(() => { setExpandedCluster(null); setVisibleCount(60) }, [expandedDomain])
  useEffect(() => { setVisibleCount(60) }, [expandedCluster])

  const searchResult = debQuery.length >= 2 ? tx.search(debQuery) : null
  const indexPending = readiness.index !== "ready"

  // ── Real-shape skeleton: stats bar + domain grid, floating over <AccentField>.
  const fallback = (
    <AccentField mode="masked" style={{ borderRadius: "var(--tm-radius-lg)" }}>
      <div className="tx-stats tx-skeleton-stats" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="tx-skeleton-line" style={{ width: 90 }} />
        ))}
      </div>
      <div className="tx-domain-grid" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="tx-domain-card tx-skeleton-card" />
        ))}
      </div>
    </AccentField>
  )

  const activeDomain = expandedDomain
  const clusters = activeDomain ? tx.clustersOf(activeDomain) : []
  const domainSkillTotal = clusters.reduce((a, c) => a + c.n, 0)

  return (
    <div className="tx-root">
      {/* ── Hero (static, paints immediately) ─────────────────────────────── */}
      <section className="tx-hero">
        <p className="tx-hero-eyebrow">Myro Skill Taxonomy</p>
        <h1 className="tx-hero-title">
          35,108 Skills.<br />One Taxonomy.<br />Zero Guesswork.
        </h1>
        <p className="tx-hero-body">
          Myro built and maintains its own skill taxonomy — the engine behind every CV
          score and job match on the platform. Browse every skill, see how they nest inside
          clusters and domains, and discover exactly what Myro looks for in yours.
        </p>
      </section>

      <SectionGate
        loading={readiness.structure === "pending"}
        error={readiness.structure === "error" ? new Error("taxonomy") : undefined}
        errorLabel="Taxonomy data unavailable — please refresh."
        fallback={fallback}
        slowText="Still loading the taxonomy…"
      >
        {stats && (
          <>
            {/* ── Stats bar ─────────────────────────────────────────────── */}
            <div className="tx-stats" role="list" aria-label="Taxonomy statistics">
              {[
                { n: stats.domains, label: "Domains" },
                { n: stats.clusters, label: "Clusters" },
                { n: stats.skills, label: "Skills" },
              ].map(({ n, label }, i) => (
                <div key={label} className="tx-stat" role="listitem">
                  {i > 0 && <span className="tx-stats-dot" aria-hidden="true">·</span>}
                  <span className="tx-stat-n">{formatCount(n)}</span>
                  <span className="tx-stat-label">{label}</span>
                </div>
              ))}
            </div>

            {/* ── Search ────────────────────────────────────────────────── */}
            <div className="tx-search-wrap">
              <label htmlFor="tx-search" className="tx-sr-only">Search skills</label>
              <div className="tx-search-box">
                <svg className="tx-search-icon" viewBox="0 0 20 20" aria-hidden="true">
                  <path fill="currentColor" d="M8.5 3a5.5 5.5 0 1 0 3.503 9.725l3.636 3.636a.75.75 0 1 0 1.06-1.06l-3.636-3.636A5.5 5.5 0 0 0 8.5 3ZM4.5 8.5a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"/>
                </svg>
                <input
                  id="tx-search"
                  className="tx-search-input"
                  type="search"
                  placeholder="Search skills…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {query && (
                  <button className="tx-search-clear" onClick={() => setQuery("")} aria-label="Clear search">×</button>
                )}
              </div>
            </div>

            {/* ── Search results ────────────────────────────────────────── */}
            {searchResult !== null && (
              <div className="tx-search-results" aria-live="polite">
                <p className="tx-search-count">
                  {searchResult.hits.length === 0
                    ? `No skills match "${debQuery}"`
                    : `${searchResult.hits.length}${searchResult.hits.length === 80 ? "+" : ""} skills matching "${debQuery}"`}
                  {searchResult.scope === "priority" && indexPending && (
                    <span className="tx-indexing"> · showing in-demand matches, indexing all skills…</span>
                  )}
                </p>
                {searchResult.hits.length > 0 && (
                  <div className="tx-search-hits">
                    {searchResult.hits.map((r) => (
                      <div key={`${r.domain}/${r.cluster}/${r.name}`} className="tx-search-hit">
                        <span className="tx-search-hit-skill">
                          {r.name}
                          <DemandBadge band={r.band} />
                        </span>
                        <span className="tx-search-hit-path" aria-label={`in ${r.domain} › ${r.cluster}`}>
                          <span className="tx-search-hit-domain">{r.domain}</span>
                          <span className="tx-search-hit-sep" aria-hidden="true">›</span>
                          <span className="tx-search-hit-cluster">{r.cluster}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── In-demand lead + domain browse ────────────────────────── */}
            {searchResult === null && (
              <>
                {!expandedDomain && (
                  <section className="tx-lead">
                    <div className="tx-lead-header">
                      <h2 className="tx-lead-title">Most in-demand skills</h2>
                      <span className="tx-lead-sub">What jobs Myro tracks are actually asking for</span>
                    </div>
                    <SectionGate
                      loading={readiness.priority === "pending"}
                      error={readiness.priority === "error" ? new Error("priority") : undefined}
                      errorLabel="In-demand skills unavailable."
                      fallback={
                        <AccentField mode="masked" style={{ borderRadius: "var(--tm-radius)" }}>
                          <div className="tx-skill-chips" aria-hidden="true">
                            {Array.from({ length: 18 }).map((_, i) => (
                              <span key={i} className="tx-skill-chip tx-skeleton-chip" />
                            ))}
                          </div>
                        </AccentField>
                      }
                    >
                      <div className="tx-skill-chips">
                        {tx.inDemand.slice(0, LEAD_COUNT).map((s) => (
                          <span key={`${s.domain}/${s.cluster}/${s.name}`} className="tx-skill-chip tx-skill-chip--demand">
                            {s.name}
                            <DemandBadge band={s.band} />
                          </span>
                        ))}
                      </div>
                    </SectionGate>
                  </section>
                )}

                <section className="tx-browse">
                  <div className="tx-browse-header">
                    {expandedDomain ? (
                      <button className="tx-back-btn" onClick={() => setExpandedDomain(null)}>
                        ← All {stats.domains} Domains
                      </button>
                    ) : (
                      <h2 className="tx-browse-title">{stats.domains} Domains</h2>
                    )}
                  </div>

                  {!expandedDomain && (
                    <div className="tx-domain-grid">
                      {tx.domains.map((domain) => (
                        <button
                          key={domain.name}
                          className="tx-domain-card"
                          onClick={() => setExpandedDomain(domain.name)}
                          aria-label={`Explore ${domain.name}: ${formatCount(domain.skills)} skills`}
                        >
                          <span className="tx-domain-name">{domain.name}</span>
                          <span className="tx-domain-meta">
                            <span className="tx-domain-clusters">{domain.clusters} clusters</span>
                            <span className="tx-domain-skillcount">{formatCount(domain.skills)} skills</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {activeDomain && (
                    <div className="tx-cluster-panel">
                      <div className="tx-cluster-domain-hdr">
                        <span className="tx-cluster-domain-name">{activeDomain}</span>
                        <span className="tx-cluster-domain-meta">
                          {clusters.length} clusters · {formatCount(domainSkillTotal)} skills
                        </span>
                      </div>

                      <div className="tx-cluster-list">
                        {clusters.map((cluster) => {
                          const open = expandedCluster === cluster.name
                          const cs = open ? tx.skillsForCluster(activeDomain, cluster.name) : null
                          return (
                            <div key={cluster.name} className="tx-cluster-item">
                              <button
                                className={`tx-cluster-btn${open ? " tx-cluster-btn--open" : ""}`}
                                onClick={() => setExpandedCluster(open ? null : cluster.name)}
                                aria-expanded={open}
                                aria-controls={`tx-skills-${cluster.name}`}
                              >
                                <span className="tx-cluster-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
                                <span className="tx-cluster-name">{cluster.name}</span>
                                <span className="tx-cluster-count" aria-label={`${cluster.n} skills`}>{cluster.n}</span>
                              </button>

                              {open && cs && (
                                <div id={`tx-skills-${cluster.name}`} className="tx-skill-panel">
                                  <div className="tx-skill-chips">
                                    {cs.skills.slice(0, visibleCount).map((skill) => (
                                      <span
                                        key={skill.name}
                                        className={`tx-skill-chip${skill.band ? " tx-skill-chip--demand" : ""}`}
                                      >
                                        {skill.name}
                                        <DemandBadge band={skill.band} />
                                      </span>
                                    ))}
                                  </div>
                                  {!cs.complete && (
                                    <p className="tx-indexing tx-indexing--block">
                                      <span className="tx-placeholder-spinner tx-spinner-sm" aria-hidden="true" />
                                      Loading the rest of this cluster…
                                    </p>
                                  )}
                                  {cs.complete && cs.skills.length > visibleCount && (
                                    <button
                                      className="tx-show-more"
                                      onClick={() => setVisibleCount((v) => v + 60)}
                                    >
                                      Show {Math.min(60, cs.skills.length - visibleCount)} more
                                      <span className="tx-show-more-total">
                                        {" "}({formatCount(cs.skills.length - visibleCount)} remaining)
                                      </span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </SectionGate>

      {/* ── CTA (static) ──────────────────────────────────────────────────── */}
      <section className="tx-cta">
        <h2 className="tx-cta-title">See which of these skills are in your CV</h2>
        <p className="tx-cta-body">
          Upload your CV and Myro maps every skill to this taxonomy — instantly.
          You get your Myro Score and top job matches before you even create an account.
        </p>
        <Link href="/#cv-hub" className="tx-cta-btn">Score my CV free →</Link>
      </section>
    </div>
  )
}
