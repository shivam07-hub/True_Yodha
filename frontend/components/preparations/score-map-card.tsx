"use client"

/**
 * ScoreMapCard — the live domain radar, on the /preparations rail. It sat on
 * the /market rail before; prep is where "what should I be better at before the
 * next interview" is actually asked, so the card moved and kept its geometry —
 * same rail card, same radar-then-lift-line stack, one tap to /skills.
 */

import Link from "next/link"
import { TrendingUp, ArrowRight } from "lucide-react"
import { useScoreMapData } from "@/lib/hooks/use-score-map-data"
import { buildScoreMap, buildScoreMapHref } from "@/lib/score-map"
import { DomainRadar } from "@/components/skills/domain-radar"

export function ScoreMapCard({ token }: { token: string }) {
  const { score, skills } = useScoreMapData(token)
  const hasRadar = !!score && Object.keys(score.domain_scores).length > 0
  const model = score && skills ? buildScoreMap(score, skills) : null
  const topMove = model?.topMove
  const href = buildScoreMapHref({ domain: model?.selected?.domain, skill: topMove?.skill })

  return (
    <section className="prp-map">
      <div className="prp-map-head">
        <span className="prp-map-ico" aria-hidden><TrendingUp size={15} /></span>
        <h2 className="prp-map-title">Score map</h2>
      </div>

      {hasRadar ? (
        <Link href={href} className="prp-map-body" aria-label="Open your Score map">
          <span className="prp-map-radar">
            <DomainRadar domainScores={score.domain_scores} />
          </span>
          <span className="prp-map-read">
            <span className="prp-map-cap">
              {topMove
                ? <>Highest verified lift: <strong>{topMove.skill}</strong> · +{topMove.gain}</>
                : "Your skills track the market — keep practising to climb."}
            </span>
            <span className="prp-map-link">
              See why and what moves it <ArrowRight size={13} aria-hidden />
            </span>
          </span>
        </Link>
      ) : (
        <p className="prp-map-empty">
          <Link href="/cv">Upload a CV</Link> to map the skill evidence behind your Myro Score.
        </p>
      )}
    </section>
  )
}
