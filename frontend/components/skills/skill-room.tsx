"use client"

import Link from "next/link"
import { ArrowLeft, ArrowRight, FileText, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { demandBandDisplay } from "@/lib/demand-band"
import { formatCount } from "@/lib/format"
import type { SkillRoomModel } from "@/lib/skill-room"
import { placeSkill } from "@/lib/skill-placement"
import { buildCvEvidenceHref, buildScoreMapHref } from "@/lib/score-map"
import { useTaxonomyContext } from "@/lib/taxonomy/use-taxonomy-context"
import "./skill-room.css"

interface Props {
  room: SkillRoomModel
}

const BADGE_VARIANT = {
  strong: "success",
  building: "soft",
  gap: "warning",
  muted: "neutral",
} as const

/**
 * The skill page — everything Myro knows about one skill, in one place.
 *
 * Two receipts sit side by side, because they are the two questions a user
 * actually has: WHERE MYRO FILED IT (the classification path through the real
 * 35,108-skill taxonomy) and WHERE IT CAME FROM (the verbatim CV line the level
 * was read off). Together they make the level falsifiable and the position
 * legible — the pair is the thing a CV scorer without a taxonomy cannot show.
 *
 * The classification spine is the signature; the CV quote is deliberately
 * undecorated, because evidence should read as a quoted document rather than a
 * styled feature. Every count on the spine is a real catalogue count — an
 * uncatalogued rung renders without a number rather than inventing a
 * denominator.
 */
export function SkillRoom({ room }: Props) {
  const { skill, domain, cluster, gap, evidence, sessionsToNext, atMax } = room
  const taxonomy = useTaxonomyContext()
  const placement = placeSkill(room, taxonomy)
  const demand = demandBandDisplay(placement?.band ?? undefined)
  const nextLevel = skill.level + 1

  return (
    <section className="sr" aria-labelledby="skill-room-name">
      <Link className="sr-back tm-control-focus" href={buildScoreMapHref({ domain })}>
        <ArrowLeft size={14} aria-hidden /> Score map
      </Link>

      <header className="sr-head">
        <h1 id="skill-room-name">{skill.display_name}</h1>
        <p className="sr-bracket">
          <strong>{skill.proficiency_title}</strong>
          <span className="sr-level">L{skill.level}</span>
          {demand && <Badge variant={BADGE_VARIANT[demand.tone]}>{demand.label}</Badge>}
        </p>
        {skill.description && <p className="sr-definition">{skill.description}</p>}
      </header>

      {placement && (
        <section className="sr-block" aria-labelledby="sr-filed">
          <p className="sr-label" id="sr-filed">Where Myro filed it</p>
          <ol className="sr-spine" role="list">
            {placement.domain && (
              <li className="sr-rung">
                <span className="sr-rung-name">{placement.domain}</span>
                {placement.domainClusters !== null && (
                  <span className="sr-rung-scale">{formatCount(placement.domainClusters)} clusters</span>
                )}
              </li>
            )}
            {placement.cluster && (
              <li className="sr-rung">
                <span className="sr-rung-name">{placement.cluster}</span>
                {placement.clusterSkills !== null && (
                  <span className="sr-rung-scale">{formatCount(placement.clusterSkills)} skills</span>
                )}
              </li>
            )}
            <li className="sr-rung sr-rung--here">
              <span className="sr-rung-name">{skill.display_name}</span>
              <span className="sr-rung-scale">you are here</span>
            </li>
          </ol>

          {placement.cluster && placement.userSkillsInCluster > 0 && (
            <p className="sr-fact sr-spine-fact">
              You hold <strong>{placement.userSkillsInCluster}</strong>
              {placement.clusterSkills !== null && <> of the {formatCount(placement.clusterSkills)}</>}
              {" "}skills in this cluster
            </p>
          )}
          {placement.totals && (
            <p className="sr-catalogue">
              Myro&rsquo;s catalogue: {formatCount(placement.totals.domains)} domains ·{" "}
              {formatCount(placement.totals.clusters)} clusters ·{" "}
              {formatCount(placement.totals.skills)} skills
            </p>
          )}
          <Link className="sr-secondary tm-control-focus" href="/taxonomy">
            Browse the taxonomy <ArrowRight size={14} aria-hidden />
          </Link>
        </section>
      )}

      <section className="sr-block" aria-labelledby="sr-from">
        <p className="sr-label" id="sr-from">Where it came from</p>
        {evidence ? (
          <>
            <blockquote className="sr-quote">{evidence}</blockquote>
            <p className="sr-source">Read from your CV.</p>
            <Link
              className="sr-secondary tm-control-focus"
              href={buildCvEvidenceHref({ domain, skill: skill.key })}
            >
              <FileText size={14} aria-hidden /> Edit this line
            </Link>
          </>
        ) : (
          <>
            <p className="sr-unproven">
              Nothing in your CV proves this yet — the level is inferred, not evidenced.
            </p>
            <Link
              className="sr-secondary tm-control-focus"
              href={buildCvEvidenceHref({ domain, skill: skill.key })}
            >
              <FileText size={14} aria-hidden /> Add the evidence
            </Link>
          </>
        )}
      </section>

      {gap && (
        <section className="sr-block" aria-labelledby="sr-market">
          <p className="sr-label" id="sr-market">What it&rsquo;s worth</p>
          <p className="sr-fact">
            Asked for in <strong>{gap.job_count_30d}</strong> live {gap.job_count_30d === 1 ? "job" : "jobs"}
            {(gap.score_delta ?? 0) >= 1 && (
              <> · <strong>+{Math.round(gap.score_delta ?? 0)}</strong> Myro Score at L{gap.target_level}</>
            )}
          </p>
          {gap.why_it_matters && <p className="sr-fact sr-fact-sub">{gap.why_it_matters}</p>}
        </section>
      )}

      {!atMax && (
        <section className="sr-block sr-next" aria-labelledby="sr-next">
          <p className="sr-label" id="sr-next">Next bracket</p>
          <p className="sr-fact">
            <strong>{sessionsToNext}</strong> focused {sessionsToNext === 1 ? "session" : "sessions"} to L{nextLevel}
          </p>
          <Link
            className="sr-primary tm-control-focus"
            href={`/forge?skill=${encodeURIComponent(skill.display_name)}`}
          >
            <Sparkles size={15} aria-hidden /> Practice this skill <ArrowRight size={14} aria-hidden />
          </Link>
        </section>
      )}

      {cluster === null && domain === null && (
        <p className="sr-fact sr-fact-sub">Not yet catalogued — Myro scored this from your CV alone.</p>
      )}
    </section>
  )
}
