"use client"

import Link from "next/link"
import { ArrowLeft, ArrowRight, FileText, Sparkles } from "lucide-react"

import type { SkillRoomModel } from "@/lib/skill-room"
import { buildCvEvidenceHref, buildScoreMapHref } from "@/lib/score-map"
import "./skill-room.css"

interface Props {
  room: SkillRoomModel
}

/**
 * The skill room — altitude 3+4 of the evidence ladder.
 *
 * Every block here is either a fact about THIS user or an action; nothing
 * labels the screen. The signature block is the verbatim CV line: showing the
 * receipt is what makes the level falsifiable, and a score you can audit is
 * the part competitors can't copy.
 *
 * Blocks disappear rather than degrade — no taxonomy definition, no gap row, or
 * no proving CV line each render as absence or an honest empty state.
 */
export function SkillRoom({ room }: Props) {
  const { skill, domain, cluster, clusterSize, gap, evidence, sessionsToNext, atMax } = room
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
        </p>
        {skill.description && <p className="sr-definition">{skill.description}</p>}
      </header>

      <section className="sr-block sr-evidence" aria-labelledby="sr-why">
        <p className="sr-label" id="sr-why">Why this level</p>
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

      {(cluster || domain) && (
        <section className="sr-block" aria-labelledby="sr-taxonomy">
          <p className="sr-label" id="sr-taxonomy">Where it sits</p>
          {cluster && (
            <p className="sr-fact">
              One of <strong>{clusterSize}</strong> of your skills in <strong>{cluster}</strong>
            </p>
          )}
          {domain && <p className="sr-fact sr-fact-sub">Scored under {domain}</p>}
        </section>
      )}

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
    </section>
  )
}
