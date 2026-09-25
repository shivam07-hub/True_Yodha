"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { RequestBoard } from "@/components/career-path/skill-path-requests"
import {
  addCertificateHref,
  groupLearningRepos,
  isLivePath,
  requestQueue,
  SENIORITY_LABEL,
  sortStoryCards,
  storyBands,
  type BandSkillMap,
  type CareerSkillPath,
  type SkillPathCard,
} from "@/lib/career-skill-path"
import "./skill-path-maps.css"

const STATE_LABEL = {
  on_cv: "On your CV",
  practised: "Practised",
  not_evidenced: "Not evidenced",
} as const

const BAND_KIND_LABEL = {
  lower: "Lower band",
  anchor: "Your band",
  higher: "Next band",
} as const

function sharePct(card: SkillPathCard): number {
  const total = card.demand?.band_job_count ?? 0
  if (total <= 0) return 0
  return Math.min(100, Math.round((100 * (card.demand?.skill_job_count ?? 0)) / total))
}

function storyAction(card: SkillPathCard) {
  if (card.certificate_status === "issued" && card.verification_id) {
    return { href: addCertificateHref(card.verification_id), label: "Add to CV" }
  }
  if (isLivePath(card)) {
    return {
      href: `/practice?skill=${encodeURIComponent(card.display_name)}`,
      label: "Practise",
    }
  }
  return null
}

function SkillCard({ card }: { card: SkillPathCard }) {
  const demand = card.demand
  const exact = demand
    ? `${demand.skill_job_count} of ${demand.band_job_count} roles in this band`
    : null
  const action = storyAction(card)

  return (
    <article className="csp-card">
      <div>
        <h3 className="csp-name">{card.display_name}</h3>
        <p className="csp-state">
          {STATE_LABEL[card.state]}
          {card.current_level ? ` · Skill level ${card.current_level}` : ""}
          {card.required_level ? ` · role asks ${card.required_level}` : ""}
        </p>
        {card.state === "on_cv" && card.evidence_pointer ? (
          <p className="csp-evidence">{card.evidence_pointer}</p>
        ) : null}
        {demand ? (
          <div className="csp-meter-row">
            <span
              className="csp-meter"
              title={exact ?? undefined}
              aria-label={exact ?? undefined}
            >
              <span style={{ width: `${sharePct(card)}%` }} />
            </span>
            <span className="csp-count" title={exact ?? undefined}>{demand.skill_job_count}</span>
            <span className={`csp-badge${demand.kind === "core" ? " is-core" : ""}`}>
              {demand.kind === "core" ? "Core" : "Often requested"}
            </span>
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="csp-actions">
          <Button size="sm" render={<Link href={action.href} />}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function skillNames(path: CareerSkillPath): Map<string, string> {
  const names = new Map<string, string>()
  for (const map of storyBands(path)) {
    for (const card of map.cards) names.set(card.taxonomy_key, card.display_name)
  }
  return names
}

function RepositoryList({ path }: { path: CareerSkillPath }) {
  const groups = groupLearningRepos(path.learning_repos ?? [])
  if (groups.length === 0) return null
  const names = skillNames(path)
  return (
    <section className="csp-band" aria-labelledby="csp-repos">
      <h2 id="csp-repos" className="csp-band-label">Repositories</h2>
      <div className="csp-repos">
        {groups.map((group) => (
          <div key={group.useCase} className="csp-repo-group">
            <h3 className="csp-repo-use">{group.label}</h3>
            <ul className="csp-repo-list">
              {group.repos.map((repo) => (
                <li key={`${repo.html_url}:${repo.taxonomy_key}`}>
                  <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
                    {repo.full_name}
                  </a>
                  <span className="csp-repo-skill">
                    {" · "}
                    {names.get(repo.taxonomy_key) ?? repo.taxonomy_key}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function BandMap({ map }: { map: BandSkillMap }) {
  const cards = sortStoryCards(map.cards)
  return (
    <section className={`csp-band${map.kind === "anchor" ? " is-anchor" : ""}`} aria-labelledby={`csp-${map.kind}`}>
      <div className="csp-band-head">
        <h2 id={`csp-${map.kind}`} className="csp-band-label">
          {BAND_KIND_LABEL[map.kind]} · {SENIORITY_LABEL[map.seniority]}
        </h2>
        {map.job_count != null ? (
          <p className="csp-band-count">{map.job_count}</p>
        ) : null}
      </div>
      {cards.length === 0 ? (
        <p className="csp-empty">No skills meet the demand threshold in this band.</p>
      ) : (
        <div className="csp-cards">
          {cards.map((item) => <SkillCard key={item.taxonomy_key} card={item} />)}
        </div>
      )}
    </section>
  )
}

export function SkillPathMaps({ path }: { path: CareerSkillPath }) {
  if (!path.snapshot) return null
  const snap = path.snapshot
  const family = snap.role_family || snap.role_title
  const places = snap.locations.length > 0 ? snap.locations.join(", ") : "anywhere"
  return (
    <div className="csp-maps">
      <header className="csp-head">
        <p className="csp-kicker">Skill path</p>
        <h1 className="csp-title">{snap.role_title}</h1>
        <p className="csp-meta">
          {snap.career_area ? `Career area · ${snap.career_area}. ` : ""}
          Role family · {family}. {SENIORITY_LABEL[snap.seniority]} · {places}.
        </p>
      </header>
      {storyBands(path).map((map) => <BandMap key={map.kind} map={map} />)}
      <RepositoryList path={path} />
      <RequestBoard cards={requestQueue(path)} />
      <p className="csp-closer">
        <Link href="/job-switch-plan">Keep a person on this path</Link>
        <span>₹199 / month</span>
      </p>
    </div>
  )
}
