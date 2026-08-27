"use client"

import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  addCertificateHref,
  SENIORITY_LABEL,
  type BandSkillMap,
  type CareerSkillPath,
  type SkillPathCard,
} from "@/lib/career-skill-path"
import { useLearningPathRequest, useLearningPathWithdraw } from "@/lib/hooks/use-career-skill-path"
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

function SkillCard({ card }: { card: SkillPathCard }) {
  const request = useLearningPathRequest()
  const withdraw = useLearningPathWithdraw()
  const [flash, setFlash] = useState<string | null>(null)
  const demand = card.demand
  const exact = demand
    ? `${demand.skill_job_count} of ${demand.band_job_count} roles in this band`
    : null

  async function onRequest() {
    try {
      const res = await request.mutateAsync(card.taxonomy_key)
      setFlash(res.message)
    } catch {
      setFlash("Couldn’t record that request. Try again.")
    }
  }

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
      <div className="csp-actions">
        {card.certificate_status === "issued" && card.verification_id ? (
          <Button size="sm" render={<Link href={addCertificateHref(card.verification_id)} />}>
            Add to CV
          </Button>
        ) : card.ladder_complete && card.next_practice_level ? (
          <Button size="sm" render={<Link href={`/practice?skill=${encodeURIComponent(card.display_name)}`} />}>
            Practise
          </Button>
        ) : card.request_status === "recorded" || flash ? (
          <>
            <p className="csp-note" role="status">
              {flash ?? "Demand recorded, we’ll let you know as soon as the assessment is live."}
            </p>
            <button type="button" className="csp-withdraw" onClick={() => withdraw.mutate(card.taxonomy_key)}>
              Withdraw request
            </button>
          </>
        ) : card.request_status === "fulfilled" ? (
          <Button size="sm" render={<Link href={`/practice?skill=${encodeURIComponent(card.display_name)}`} />}>
            Practise
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={request.isPending}
            onClick={() => void onRequest()}
          >
            Request this learning path
          </Button>
        )}
      </div>
    </article>
  )
}

function BandMap({ map }: { map: BandSkillMap }) {
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
      {map.cards.length === 0 ? (
        <p className="csp-empty">No skills meet the demand threshold in this band.</p>
      ) : (
        <div className="csp-cards">
          {map.cards.map((card) => <SkillCard key={card.taxonomy_key} card={card} />)}
        </div>
      )}
    </section>
  )
}

export function SkillPathMaps({ path }: { path: CareerSkillPath }) {
  if (!path.snapshot) return null
  const snap = path.snapshot
  const family = snap.role_family_label || snap.role_title
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
      {path.lower ? <BandMap map={path.lower} /> : null}
      {path.anchor ? <BandMap map={path.anchor} /> : null}
      {path.higher ? <BandMap map={path.higher} /> : null}
    </div>
  )
}
