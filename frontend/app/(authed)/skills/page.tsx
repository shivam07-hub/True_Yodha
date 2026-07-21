"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, FileText, Sparkles } from "lucide-react"

import { RequiresCV } from "@/components/empty/RequiresCV"
import { ForgeSkeleton } from "@/components/loading/page-skeletons"
import { BandPercentileLine } from "@/components/skills/band-percentile-line"
import { DomainRadar } from "@/components/skills/domain-radar"
import { ScoreBreakdown } from "@/components/skills/score-breakdown"
import { ScoreRing } from "@/components/skills/score-ring"
import { useAuth } from "@/lib/hooks/use-auth"
import { useScoreMapData } from "@/lib/hooks/use-score-map-data"
import { bandLabel } from "@/lib/score-methodology"
import { buildCvEvidenceHref, buildScoreMap, buildScoreMapHref } from "@/lib/score-map"
import "./score-map.css"

function ScoreMapPageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const breakdownRef = useRef<HTMLDivElement>(null)
  const { score, skills, isLoading, isError } = useScoreMapData(token)
  const domainParam = searchParams.get("domain")
  const panelParam = searchParams.get("panel")

  const model = useMemo(
    () => score && skills ? buildScoreMap(score, skills, domainParam) : null,
    [score, skills, domainParam],
  )

  const showBreakdown = () => breakdownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })

  useEffect(() => {
    if (panelParam !== "why" || !model) return
    const id = requestAnimationFrame(showBreakdown)
    return () => cancelAnimationFrame(id)
  }, [panelParam, model])

  if (!ready || isLoading) return <ForgeSkeleton />

  return (
    <RequiresCV surface="skills">
      <main className="sm-page">
        <Link href="/market" className="sm-back tm-control-focus">
          <ArrowLeft size={14} aria-hidden /> Jobs
        </Link>

        {isError || !score || !skills || !model || model.axes.length === 0 ? (
          <section className="sm-error" role="status">
            <h1>Score map unavailable</h1>
            <p>Your CV is safe. Refresh once scoring finishes.</p>
          </section>
        ) : (
          <>
            <header className="sm-hero">
              <div>
                <p className="sm-kicker">Score &amp; skills</p>
                <h1>One score. The evidence behind it.</h1>
                <p className="sm-hero-copy">
                  Your {model.totalScore} is the average of the {model.axes.length} skill {model.axes.length === 1 ? "domain" : "domains"} your CV currently proves.
                </p>
              </div>
              <div className="sm-score">
                <ScoreRing
                  score={model.totalScore}
                  onExpand={showBreakdown}
                  expanded={false}
                  controls="score-map-breakdown"
                />
                <BandPercentileLine band={score.band} topPercent={score.top_percent} />
                <span>Calibrated for {bandLabel(score.band)}</span>
              </div>
            </header>

            <div className="sm-grid">
              <section className="sm-card sm-radar-card" aria-labelledby="score-map-title">
                <div className="sm-card-head">
                  <div>
                    <p className="sm-eyebrow">Same calculation</p>
                    <h2 id="score-map-title">Your Score map</h2>
                  </div>
                  <span>{model.axes.length} evidenced domains</span>
                </div>
                <div className="sm-radar-wrap">
                  <DomainRadar
                    domainScores={score.domain_scores}
                    activeDomain={model.selected?.domain}
                    onDomainClick={(domain) => router.replace(
                      buildScoreMapHref({
                        panel: panelParam === "why" ? "why" : undefined,
                        domain,
                      }),
                      { scroll: false },
                    )}
                  />
                </div>
                <nav className="sm-domain-list" aria-label="Scored skill domains">
                  {model.axes.map((axis) => (
                    <button
                      key={axis.domain}
                      type="button"
                      className={axis.domain === model.selected?.domain ? "is-active" : ""}
                      onClick={() => router.replace(
                        buildScoreMapHref({
                          panel: panelParam === "why" ? "why" : undefined,
                          domain: axis.domain,
                        }),
                        { scroll: false },
                      )}
                    >
                      <span>{axis.domain}</span><strong>{axis.score}</strong>
                    </button>
                  ))}
                </nav>
              </section>

              {model.selected && (
                <aside className="sm-card sm-focus" aria-live="polite">
                  <p className="sm-eyebrow">Selected domain</p>
                  <div className="sm-focus-title">
                    <h2>{model.selected.domain}</h2>
                    <strong>{model.selected.score}</strong>
                  </div>
                  <p className="sm-focus-meta">
                    {model.selected.evidenceCount} of {model.selected.skills.length} detected {model.selected.skills.length === 1 ? "skill has" : "skills have"} direct CV evidence.
                  </p>

                  <div className="sm-skill-chips">
                    {model.selected.skills.slice(0, 8).map((skill) => (
                      <span key={skill.key} data-proof={skill.evidence_text ? "yes" : "no"}>
                        {skill.display_name} <em>L{skill.level}</em>
                      </span>
                    ))}
                  </div>

                  {model.topMove ? (
                    <section className="sm-move" aria-labelledby="top-move-title">
                      <p className="sm-eyebrow">Highest verified lift</p>
                      <h3 id="top-move-title">Build {model.topMove.skill}</h3>
                      <p>
                        One level projects <strong>+{model.topMove.gain} Myro Score {model.topMove.gain === 1 ? "point" : "points"}</strong>
                        {model.topMove.jobs > 0 ? ` and appears in ${model.topMove.jobs} recent jobs.` : "."}
                      </p>
                      <div className="sm-actions">
                        <Link className="sm-primary tm-control-focus" href={`/forge?skill=${encodeURIComponent(model.topMove.skill)}`}>
                          <Sparkles size={15} aria-hidden /> Practice <ArrowRight size={14} aria-hidden />
                        </Link>
                        <Link className="sm-secondary tm-control-focus" href={buildCvEvidenceHref({ domain: model.selected.domain, skill: model.topMove.skill })}>
                          <FileText size={15} aria-hidden /> Review CV proof
                        </Link>
                      </div>
                    </section>
                  ) : (
                    <section className="sm-move">
                      <p className="sm-eyebrow">Next move</p>
                      <h3>Strengthen the evidence</h3>
                      <p>Review the exact CV lines Myro used before deciding what to change.</p>
                      <Link className="sm-primary tm-control-focus" href={buildCvEvidenceHref({ domain: model.selected.domain })}>
                        <FileText size={15} aria-hidden /> Review CV proof <ArrowRight size={14} aria-hidden />
                      </Link>
                    </section>
                  )}
                </aside>
              )}
            </div>

            <div ref={breakdownRef} className="sm-breakdown" id="score-map-breakdown">
              <div className="sm-breakdown-head">
                <p className="sm-eyebrow">Why {model.totalScore}</p>
                <h2>How the score is calculated</h2>
              </div>
              <ScoreBreakdown
                score={model.totalScore}
                domainScores={score.domain_scores}
                gapSkills={score.gap_skills}
              />
            </div>
          </>
        )}
      </main>
    </RequiresCV>
  )
}

export default function ScoreMapPage() {
  return <Suspense fallback={<ForgeSkeleton />}><ScoreMapPageInner /></Suspense>
}
