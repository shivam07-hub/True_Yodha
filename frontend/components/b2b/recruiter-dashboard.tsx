"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { ArrowRight, Crosshair, FileText, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { B2BWorkspaceShell, type WorkspaceMetric } from "./workspace-shell"
import {
  buildRecruiterPipeline,
  computeRecruiterMatches,
  DEFAULT_RECRUITER_BRIEF,
  L2_CLUSTERS,
  MUST_HAVE_SKILLS,
  RECRUITER_TABS,
  toggleSkill,
  type RecruiterBrief,
  type RecruiterTab,
} from "./recruiter-model"

export function RecruiterDashboard() {
  const [activeTab, setActiveTab] = useState<RecruiterTab>("brief")
  const [brief, setBrief] = useState<RecruiterBrief>(DEFAULT_RECRUITER_BRIEF)
  const deferredDescription = useDeferredValue(brief.jobDescription)

  const computedBrief = useMemo(
    () => ({ ...brief, jobDescription: deferredDescription }),
    [brief, deferredDescription],
  )
  const matches = useMemo(() => computeRecruiterMatches(computedBrief), [computedBrief])
  const pipeline = useMemo(() => buildRecruiterPipeline(matches), [matches])
  const topMatch = matches[0]

  const metrics: WorkspaceMetric[] = [
    { label: "L2 cluster", value: brief.l2Cluster, hint: "comparison stays inside one homogeneous skill band" },
    { label: "Profiles surfaced", value: `${matches.length}`, hint: "only candidates with real must-have overlap survive" },
    { label: "Strong handoff", value: `${matches.slice(0, 3).length} profiles`, hint: "the slate is designed to stop at the strongest few" },
  ]

  function update<K extends keyof RecruiterBrief>(key: K, value: RecruiterBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }))
  }

  return (
    <B2BWorkspaceShell
      eyebrow="myro recruiter workspace"
      title={
        <>
          Turn one JD into a <em>tighter hiring slate</em>.
        </>
      }
      subtitle="This is the B2B mirror of the candidate engine: structured role brief in, L2-cluster shortlist out, with evidence visible on every profile."
      metrics={metrics}
      tabs={RECRUITER_TABS as unknown as { id: string; label: string; hint: string }[]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      primaryAction={{ label: "Open talent slate", onClick: () => setActiveTab("talent") }}
      secondaryAction={{ label: "Review pipeline", onClick: () => setActiveTab("pipeline") }}
    >
      {activeTab === "brief" ? (
        <div className="b2bws-grid">
          <section className="b2bws-panel">
            <span className="b2bws-kicker">structured JD intake</span>
            <h2>Mirror the CV side with a role brief first.</h2>
            <div className="b2bws-form-grid">
              <div className="b2bws-field">
                <label htmlFor="companyName">Company name</label>
                <input id="companyName" className="b2bws-input" value={brief.companyName} onChange={(e) => update("companyName", e.target.value)} />
              </div>
              <div className="b2bws-field">
                <label htmlFor="industry">Industry</label>
                <input id="industry" className="b2bws-input" value={brief.industry} onChange={(e) => update("industry", e.target.value)} />
              </div>
              <div className="b2bws-field">
                <label htmlFor="jobRole">Job role</label>
                <input id="jobRole" className="b2bws-input" value={brief.jobRole} onChange={(e) => update("jobRole", e.target.value)} />
              </div>
              <div className="b2bws-field">
                <label htmlFor="cluster">L2 cluster</label>
                <select id="cluster" className="b2bws-select" value={brief.l2Cluster} onChange={(e) => update("l2Cluster", e.target.value)}>
                  {L2_CLUSTERS.map((cluster) => (
                    <option key={cluster} value={cluster}>
                      {cluster}
                    </option>
                  ))}
                </select>
              </div>
              <div className="b2bws-field b2bws-field--full">
                <label htmlFor="jobDescription">Job description</label>
                <textarea id="jobDescription" className="b2bws-textarea" value={brief.jobDescription} onChange={(e) => update("jobDescription", e.target.value)} />
              </div>
            </div>

            <div className="b2bws-stack">
              <div className="b2bws-field">
                <span className="b2bws-field-label">Must-have skills</span>
                <div className="b2bws-chip-row">
                  {MUST_HAVE_SKILLS.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      className="b2bws-chip"
                      data-active={brief.mustHaveSkills.includes(skill)}
                      onClick={() => update("mustHaveSkills", toggleSkill(brief.mustHaveSkills, skill))}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
              <div className="b2bws-panel">
                <span className="b2bws-kicker">mirror rules</span>
                <h3>What keeps this recruiter side honest</h3>
                <ul className="b2bws-bullets">
                  <li><span className="b2bws-bullet-dot" /><span>The shortlist only compares profiles inside the chosen L2 cluster.</span></li>
                  <li><span className="b2bws-bullet-dot" /><span>Every surfaced profile must show actual overlap with your must-have skills.</span></li>
                  <li><span className="b2bws-bullet-dot" /><span>The output aims for 3-4 strong profiles, not a noisy hundred-CV queue.</span></li>
                </ul>
              </div>
            </div>
          </section>

          <section className="b2bws-panel">
            <span className="b2bws-kicker">live preview</span>
            <h2>What this brief is producing right now</h2>
            {topMatch ? (
              <>
                <div className="b2bws-score">
                  <Crosshair size={16} aria-hidden />
                  <span>{topMatch.score}% best current fit</span>
                </div>
                <div className="b2bws-card-copy">
                  <h3>{topMatch.name}</h3>
                  <p>{topMatch.title} · {topMatch.experience} · {topMatch.location}</p>
                </div>
                <ul className="b2bws-bullets">
                  {topMatch.evidence.map((line) => (
                    <li key={line}>
                      <span className="b2bws-bullet-dot" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="b2bws-card-meta">
                  {topMatch.overlappingSkills.map((skill) => (
                    <span key={skill} className="b2bws-mini">{skill}</span>
                  ))}
                  <span className="b2bws-pill">{topMatch.readiness}</span>
                </div>
                <Button variant="outline" onClick={() => setActiveTab("talent")}>
                  See full talent slate
                  <ArrowRight />
                </Button>
              </>
            ) : (
              <div className="b2bws-empty">No profiles meet this L2-skill brief yet. Add or change must-have skills to reopen the slate.</div>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === "talent" ? (
        <div className="b2bws-stack">
          <section className="b2bws-panel">
            <span className="b2bws-kicker">filtered slate</span>
            <h2>{brief.jobRole} · {brief.companyName}</h2>
            <p className="b2bws-copy">Cluster locked to <strong>{brief.l2Cluster}</strong>. Profiles below are sorted by must-have overlap, readiness, and evidence fit.</p>
          </section>
          <div className="b2bws-candidate-grid">
            {matches.map((candidate) => (
              <article key={candidate.id} className="b2bws-panel">
                <div className="b2bws-card-meta">
                  <span className="b2bws-score"><Filter size={16} />{candidate.score}% match</span>
                  <span className="b2bws-pill">{candidate.readiness}</span>
                </div>
                <div className="b2bws-card-copy">
                  <h3>{candidate.name}</h3>
                  <p>{candidate.title} · {candidate.experience} · {candidate.location}</p>
                  <p>{candidate.summary}</p>
                </div>
                <div className="b2bws-card-meta">
                  {candidate.overlappingSkills.map((skill) => (
                    <span key={skill} className="b2bws-mini">{skill}</span>
                  ))}
                </div>
                <ul className="b2bws-bullets">
                  {candidate.evidence.map((line) => (
                    <li key={line}>
                      <span className="b2bws-bullet-dot" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "pipeline" ? (
        <section className="b2bws-panel">
          <span className="b2bws-kicker">handoff rhythm</span>
          <h2>Keep the recruiter workflow narrow and accountable.</h2>
          <div className="b2bws-stage-grid">
            {pipeline.map((stage) => (
              <article key={stage.label} className="b2bws-stage">
                <div className="b2bws-card-meta">
                  <span className="b2bws-stage-label">{stage.label}</span>
                  <span className="b2bws-score"><FileText size={16} />{stage.count}</span>
                </div>
                <ul className="b2bws-bullets">
                  {stage.items.map((item) => (
                    <li key={item}>
                      <span className="b2bws-bullet-dot" />
                      <span className="b2bws-stage-copy">{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </B2BWorkspaceShell>
  )
}
