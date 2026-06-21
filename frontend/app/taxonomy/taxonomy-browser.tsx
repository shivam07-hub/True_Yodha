"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import "./taxonomy.css"

interface SkillNode  { name: string; id?: string }
interface ClusterNode { name: string; children: SkillNode[] }
interface DomainNode  { name: string; children: ClusterNode[] }
interface TaxonomyData { name: string; children: DomainNode[] }
interface FlatSkill   { skill: string; cluster: string; domain: string }

export function TaxonomyBrowser() {
  const [data, setData]                   = useState<TaxonomyData | null>(null)
  const [loadState, setLoadState]         = useState<"loading" | "ok" | "error">("loading")
  const [query, setQuery]                 = useState("")
  const [debQuery, setDebQuery]           = useState("")
  const [expandedDomain, setExpandedDomain]   = useState<string | null>(null)
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null)
  const [visibleCount, setVisibleCount]   = useState(60)

  // Fetch taxonomy JSON from public/data (not bundled)
  useEffect(() => {
    fetch("/data/skill_taxonomy.json")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoadState("ok") })
      .catch(() => setLoadState("error"))
  }, [])

  // Debounce search 220ms
  useEffect(() => {
    const id = setTimeout(() => setDebQuery(query), 220)
    return () => clearTimeout(id)
  }, [query])

  // Flat index for search — build once
  const flatIndex = useMemo<FlatSkill[]>(() => {
    if (!data) return []
    const out: FlatSkill[] = []
    for (const d of data.children)
      for (const c of d.children)
        for (const s of c.children)
          out.push({ skill: s.name, cluster: c.name, domain: d.name })
    return out
  }, [data])

  // Per-domain skill counts
  const domainCounts = useMemo<Record<string, { skills: number; clusters: number }>>(() => {
    if (!data) return {}
    const m: Record<string, { skills: number; clusters: number }> = {}
    for (const d of data.children) {
      let skills = 0
      for (const c of d.children) skills += c.children.length
      m[d.name] = { skills, clusters: d.children.length }
    }
    return m
  }, [data])

  // Aggregate stats
  const stats = useMemo(() => {
    if (!data) return null
    let clusters = 0; let skills = 0
    for (const d of data.children) {
      clusters += d.children.length
      for (const c of d.children) skills += c.children.length
    }
    return { domains: data.children.length, clusters, skills }
  }, [data])

  // Search results — max 80
  const searchResults = useMemo<FlatSkill[] | null>(() => {
    if (debQuery.length < 2) return null
    const q = debQuery.toLowerCase()
    return flatIndex.filter((s) => s.skill.toLowerCase().includes(q)).slice(0, 80)
  }, [debQuery, flatIndex])

  // Reset cluster + pagination when domain changes
  useEffect(() => { setExpandedCluster(null); setVisibleCount(60) }, [expandedDomain])
  useEffect(() => { setVisibleCount(60) }, [expandedCluster])

  const activeDomain  = expandedDomain  ? data?.children.find((d) => d.name === expandedDomain)  : null

  if (loadState === "loading") {
    return (
      <div className="tx-placeholder">
        <span className="tx-placeholder-spinner" aria-label="Loading taxonomy…" />
        <span className="tx-placeholder-text">Loading 35,108 skills…</span>
      </div>
    )
  }
  if (loadState === "error" || !data || !stats) {
    return (
      <div className="tx-placeholder">
        <span className="tx-placeholder-text">Taxonomy data unavailable — please refresh.</span>
      </div>
    )
  }

  return (
    <div className="tx-root">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="tx-hero">
        <p className="tx-hero-eyebrow">Myro Skill Taxonomy</p>
        <h1 className="tx-hero-title">
          35,108 Skills.<br />One Taxonomy.<br />Zero Guesswork.
        </h1>
        <p className="tx-hero-body">
          Myro built and maintains its own skill taxonomy — the engine behind every CV
          score and job match on the platform. Browse all{" "}
          {stats.skills.toLocaleString()} skills, see how they nest inside{" "}
          {stats.clusters.toLocaleString()} clusters and {stats.domains} domains, and
          discover exactly what Myro looks for in yours.
        </p>
      </section>

      {/* ── Stats bar ────────────────────────────────────── */}
      <div className="tx-stats" role="list" aria-label="Taxonomy statistics">
        {[
          { n: stats.domains,            label: "Domains"  },
          { n: stats.clusters,           label: "Clusters" },
          { n: stats.skills,             label: "Skills"   },
        ].map(({ n, label }, i) => (
          <div key={label} className="tx-stat" role="listitem">
            {i > 0 && <span className="tx-stats-dot" aria-hidden="true">·</span>}
            <span className="tx-stat-n">{n.toLocaleString()}</span>
            <span className="tx-stat-label">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Search ───────────────────────────────────────── */}
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
            placeholder="Search 35,108 skills…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="tx-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Search results ───────────────────────────────── */}
      {searchResults !== null && (
        <div className="tx-search-results" aria-live="polite">
          <p className="tx-search-count">
            {searchResults.length === 0
              ? `No skills match "${debQuery}"`
              : `${searchResults.length}${searchResults.length === 80 ? "+" : ""} skills matching "${debQuery}"`}
          </p>
          {searchResults.length > 0 && (
            <div className="tx-search-hits">
              {searchResults.map((r) => (
                <div key={`${r.domain}/${r.cluster}/${r.skill}`} className="tx-search-hit">
                  <span className="tx-search-hit-skill">{r.skill}</span>
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

      {/* ── Domain grid / drill-down ─────────────────────── */}
      {searchResults === null && (
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

          {/* Collapsed domain grid */}
          {!expandedDomain && (
            <div className="tx-domain-grid">
              {data.children.map((domain) => {
                const c = domainCounts[domain.name]
                return (
                  <button
                    key={domain.name}
                    className="tx-domain-card"
                    onClick={() => setExpandedDomain(domain.name)}
                    aria-label={`Explore ${domain.name}: ${c.skills.toLocaleString()} skills`}
                  >
                    <span className="tx-domain-name">{domain.name}</span>
                    <span className="tx-domain-meta">
                      <span className="tx-domain-clusters">{c.clusters} clusters</span>
                      <span className="tx-domain-skillcount">{c.skills.toLocaleString()} skills</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Cluster drill-down */}
          {activeDomain && (
            <div className="tx-cluster-panel">
              <div className="tx-cluster-domain-hdr">
                <span className="tx-cluster-domain-name">{activeDomain.name}</span>
                <span className="tx-cluster-domain-meta">
                  {activeDomain.children.length} clusters ·{" "}
                  {domainCounts[activeDomain.name]?.skills.toLocaleString()} skills
                </span>
              </div>

              <div className="tx-cluster-list">
                {activeDomain.children.map((cluster) => {
                  const open = expandedCluster === cluster.name
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
                        <span className="tx-cluster-count" aria-label={`${cluster.children.length} skills`}>
                          {cluster.children.length}
                        </span>
                      </button>

                      {open && (
                        <div id={`tx-skills-${cluster.name}`} className="tx-skill-panel">
                          <div className="tx-skill-chips">
                            {cluster.children.slice(0, visibleCount).map((skill) => (
                              <span key={skill.name} className="tx-skill-chip">{skill.name}</span>
                            ))}
                          </div>
                          {cluster.children.length > visibleCount && (
                            <button
                              className="tx-show-more"
                              onClick={() => setVisibleCount((v) => v + 60)}
                            >
                              Show {Math.min(60, cluster.children.length - visibleCount)} more
                              <span className="tx-show-more-total">
                                {" "}({(cluster.children.length - visibleCount).toLocaleString()} remaining)
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
      )}

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="tx-cta">
        <h2 className="tx-cta-title">See which of these skills are in your CV</h2>
        <p className="tx-cta-body">
          Upload your CV and Myro maps every skill to this taxonomy — instantly.
          You get your Myro Score and top job matches before you even create an account.
        </p>
        <Link href="/#cv-hub" className="tx-cta-btn">
          Score my CV free →
        </Link>
      </section>
    </div>
  )
}
