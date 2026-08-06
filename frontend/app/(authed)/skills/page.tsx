"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, FileText, Sparkles } from "lucide-react"

import { RequiresCV } from "@/components/empty/RequiresCV"
import { PracticeSkeleton } from "@/components/loading/page-skeletons"
import { BandPercentileLine } from "@/components/skills/band-percentile-line"
import { DomainRadar } from "@/components/skills/domain-radar"
import { ScoreBreakdown } from "@/components/skills/score-breakdown"
import { ScoreRing } from "@/components/skills/score-ring"
import { SkillRoom } from "@/components/skills/skill-room"
import { useAuth } from "@/lib/hooks/use-auth"
import { useScoreMapData } from "@/lib/hooks/use-score-map-data"
import { buildCvEvidenceHref, buildScoreMap, buildScoreMapHref } from "@/lib/score-map"
import { domainClusterCount } from "@/lib/skill-placement"
import { buildSkillRoom } from "@/lib/skill-room"
import { useTaxonomyContext } from "@/lib/taxonomy/use-taxonomy-context"
import "./score-map.css"

function ScoreMapPageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const whyRef = useRef<HTMLElement>(null)
  const { score, skills, isLoading, isError } = useScoreMapData(token)
  const taxonomy = useTaxonomyContext()
  const domainParam = searchParams.get("domain")
  const panelParam = searchParams.get("panel")
  const skillParam = searchParams.get("skill")

  const model = useMemo(
    () => score && skills ? buildScoreMap(score, skills, domainParam) : null,
    [score, skills, domainParam],
  )
  // Altitude 3+4: when a skill is addressed, it owns the page — one question
  // per screen. The room carries its own way back to the map.
  const room = useMemo(
    () => score && skills ? buildSkillRoom(score, skills, skillParam) : null,
    [score, skills, skillParam],
  )

  // The decomposition now lives permanently in the score-map card, so "why"
  // deep-links (nav score chip) just bring it into view — no disclosure to open.
  const showWhy = () => whyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })

  // Selecting a domain (radar axis or a breakdown bar) is one URL change; the
  // model re-derives `selected`, updating the radar highlight and focus panel
  // together. `scroll: false` keeps the picker steady while the aside updates.
  const selectDomain = (domain: string) => router.replace(
    buildScoreMapHref({ panel: panelParam === "why" ? "why" : undefined, domain }),
    { scroll: false },
  )

  useEffect(() => {
    if (panelParam !== "why" || !model || room) return
    const id = requestAnimationFrame(showWhy)
    return () => cancelAnimationFrame(id)
  }, [panelParam, model, room])

  if (!ready || isLoading) return <PracticeSkeleton />

  return (
    <RequiresCV surface="skills">
      <main className="sm-page">
        {isError || !score || !skills || !model || model.axes.length === 0 ? (
          <section className="sm-error" role="status">
            <h1>Score map unavailable</h1>
            <p>Your CV is safe. Refresh once scoring finishes.</p>
          </section>
        ) : room ? (
          <SkillRoom room={room} />
        ) : (
          <>
            <h1 className="sm-sr-only">Your Myro Score and the evidence behind it</h1>
            <header className="sm-hero">
              <ScoreRing score={model.totalScore} />
              <BandPercentileLine band={score.band} topPercent={score.top_percent} />
              <p className="sm-hero-copy">
                Your {model.totalScore} is the average of the {model.axes.length} skill {model.axes.length === 1 ? "domain" : "domains"} your CV currently proves.
              </p>
            </header>

            <div className="sm-grid">
              <section ref={whyRef} id="score-map-breakdown" className="sm-card sm-radar-card" aria-labelledby="score-map-title">
                <div className="sm-card-head">
                  <h2 id="score-map-title">Your Score map</h2>
                  <span>{model.axes.length} evidenced domains</span>
                </div>
                <div className="sm-radar-wrap">
                  <DomainRadar
                    domainScores={score.domain_scores}
                    activeDomain={model.selected?.domain}
                    onDomainClick={selectDomain}
                  />
                </div>
                <ScoreBreakdown
                  variant="selector"
                  score={model.totalScore}
                  domainScores={score.domain_scores}
                  gapSkills={score.gap_skills}
                  activeDomain={model.selected?.domain ?? model.selectedEmptyDomain}
                  onSelectDomain={selectDomain}
                />
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
                      <Link
                        key={skill.key}
                        className="tm-control-focus"
                        href={buildScoreMapHref({ domain: model.selected?.domain, skill: skill.key })}
                        data-proof={skill.evidence_text ? "yes" : "no"}
                      >
                        {skill.display_name} <em>L{skill.level}</em>
                      </Link>
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
                        <Link className="sm-primary tm-control-focus" href={`/practice?skill=${encodeURIComponent(model.topMove.skill)}`}>
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

              {model.selectedEmptyDomain && (() => {
                const domain = model.selectedEmptyDomain
                const clusters = domainClusterCount(domain, taxonomy)
                return (
                  <aside className="sm-card sm-focus sm-focus-empty" aria-live="polite">
                    <p className="sm-eyebrow">Not yet evidenced</p>
                    <div className="sm-focus-title">
                      <h2>{domain}</h2>
                    </div>
                    <p className="sm-focus-meta">
                      No CV evidence in {domain} yet — it isn&rsquo;t counted for or against your score.
                      {clusters !== null && <> Myro tracks <strong>{clusters}</strong> {clusters === 1 ? "cluster" : "clusters"} here.</>}
                    </p>
                    <section className="sm-move">
                      <Link className="sm-primary tm-control-focus" href={buildCvEvidenceHref({ domain })}>
                        <FileText size={15} aria-hidden /> Add evidence to your CV <ArrowRight size={14} aria-hidden />
                      </Link>
                    </section>
                  </aside>
                )
              })()}
            </div>
          </>
        )}
      </main>
    </RequiresCV>
  )
}

export default function ScoreMapPage() {
  return <Suspense fallback={<PracticeSkeleton />}><ScoreMapPageInner /></Suspense>
}
