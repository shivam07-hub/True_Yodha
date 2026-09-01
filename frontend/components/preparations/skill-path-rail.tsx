"use client"

/**
 * Compact Skill path for the Prep standing column.
 * Radar is the mark (tap → /skills). Your band only, gaps first.
 * Learning-path requests stay on /practice; Finlatics sits under this list.
 *
 * Anti-slop: not a third card (Score map folded). No Sparkles. No numbered
 * journey. Hover only on links. Page still reads as ours in grey.
 */

import Link from "next/link"

import {
  addCertificateHref,
  SENIORITY_LABEL,
  sortAnchorCards,
  type SkillPathCard,
} from "@/lib/career-skill-path"
import { useCareerSkillPath } from "@/lib/hooks/use-career-skill-path"
import { useScoreMapData } from "@/lib/hooks/use-score-map-data"
import { buildScoreMap, buildScoreMapHref } from "@/lib/score-map"
import { DomainRadar } from "@/components/skills/domain-radar"
import "./skill-path-rail.css"

const STATE_LABEL = {
  on_cv: "On your CV",
  practised: "Practised",
  not_evidenced: "Not evidenced",
} as const

function sharePct(card: SkillPathCard): number {
  const total = card.demand?.band_job_count ?? 0
  if (total <= 0) return 0
  return Math.min(100, Math.round((100 * (card.demand?.skill_job_count ?? 0)) / total))
}

function skillAction(card: SkillPathCard): { href: string; label: string } | null {
  if (card.certificate_status === "issued" && card.verification_id) {
    return { href: addCertificateHref(card.verification_id), label: "Add to CV" }
  }
  if ((card.ladder_complete && card.next_practice_level) || card.request_status === "fulfilled") {
    return {
      href: `/practice?skill=${encodeURIComponent(card.display_name)}`,
      label: "Practise",
    }
  }
  return null
}

function SkillRow({ card }: { card: SkillPathCard }) {
  const action = skillAction(card)
  const demand = card.demand
  const exact = demand
    ? `${demand.skill_job_count} of ${demand.band_job_count} roles in this band`
    : null
  return (
    <article className="prp-sk-row">
      <div className="prp-sk-copy">
        <h4 className="prp-sk-name">{card.display_name}</h4>
        <p className="prp-sk-state">
          {STATE_LABEL[card.state]}
          {card.required_level ? ` · role asks ${card.required_level}` : ""}
        </p>
        {demand ? (
          <div className="prp-sk-meter-row">
            <span className="prp-sk-meter" title={exact ?? undefined} aria-label={exact ?? undefined}>
              <span style={{ width: `${sharePct(card)}%` }} />
            </span>
            <span className="prp-sk-count" title={exact ?? undefined}>{demand.skill_job_count}</span>
          </div>
        ) : null}
      </div>
      {action ? (
        <Link href={action.href} className="prp-sk-action tm-link tm-control-focus">
          {action.label}
        </Link>
      ) : null}
    </article>
  )
}

export function SkillPathRail({ token }: { token: string }) {
  const path = useCareerSkillPath()
  const { score, skills, isLoading: scoreLoading } = useScoreMapData(token)
  const hasRadar = !!score && Object.keys(score.domain_scores).length > 0
  const model = score && skills ? buildScoreMap(score, skills) : null
  const href = buildScoreMapHref({ domain: model?.selected?.domain, skill: model?.topMove?.skill })
  const snap = path.data?.snapshot
  const cards = path.data?.anchor ? sortAnchorCards(path.data.anchor.cards) : []
  const band = path.data?.anchor
  const waiting = scoreLoading || path.isLoading

  return (
    <section className="prp-stand" aria-labelledby="prp-sk-title">
      <header className="prp-sk-head">
        <div className="prp-sk-lead">
          <p className="prp-sk-kicker" id={snap ? undefined : "prp-sk-title"}>Skill path</p>
          {snap ? (
            <>
              <h3 id="prp-sk-title" className="prp-sk-title">{snap.role_title}</h3>
              {band ? (
                <p className="prp-sk-meta">{SENIORITY_LABEL[band.seniority]}</p>
              ) : null}
            </>
          ) : null}
          {!waiting && !hasRadar ? (
            <p className="prp-sk-door">
              <Link href="/onboarding" className="tm-link tm-control-focus">Upload a CV</Link>
            </p>
          ) : !waiting && path.data?.needs_target ? (
            <p className="prp-sk-door">
              <Link href="/onboarding" className="tm-link tm-control-focus">Pick your target role</Link>
            </p>
          ) : null}
        </div>
        {hasRadar && score ? (
          <Link href={href} className="prp-sk-radar tm-control-focus" aria-label="Open your Score map">
            <DomainRadar domainScores={score.domain_scores} />
          </Link>
        ) : null}
      </header>
      {cards.length > 0 ? (
        <div className="prp-sk-list">
          {cards.map((card) => <SkillRow key={card.taxonomy_key} card={card} />)}
        </div>
      ) : null}
    </section>
  )
}
