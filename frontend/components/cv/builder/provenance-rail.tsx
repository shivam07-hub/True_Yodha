/**
 * ProvenanceRail — "the story behind this line". Click a CV bullet, see the
 * real career story it traces to (Master CV: bullets ARE the story's pointer
 * verbatim, so there is exactly one card). On a tailored copy the bullet may
 * since have been molded for the job — a second card shows that line plus
 * the job's matched terms that actually occur in it. Nothing invented: a
 * bullet with no matched story renders an honest "not linked yet" state.
 */
"use client"

import type { CareerProfileRole, CareerStory } from "@/lib/api"
import { I, LIcon } from "./library-icons"

const STAR_FIELDS = [
  ["situation", "S"],
  ["task", "T"],
  ["action", "A"],
  ["result", "R"],
] as const

interface ProvenanceRailProps {
  bulletText: string
  story: CareerStory | null
  role: CareerProfileRole | null
  /** Present only when viewing a per-job tailored copy (context = "tailored"). */
  tailoredFor: { company: string; jobId: string } | null
  matchedTerms: string[]
  onOpenTailorWorkspace: (jobId: string) => void
}

export function ProvenanceRail({ bulletText, story, role, tailoredFor, matchedTerms, onOpenTailorWorkspace }: ProvenanceRailProps) {
  if (!story) {
    return (
      <aside className="tm-prov-rail" aria-label="The story behind this line">
        <div className="tm-prov-rail-eyebrow">The story behind this line</div>
        <div className="tm-prov-empty">
          Not yet linked to a story in your reservoir. Edit this line from Stories,
          or drop more of your past there — Myro links new bullets automatically.
        </div>
      </aside>
    )
  }

  const narrative = STAR_FIELDS.filter(([key]) => (story.narrative[key] || "").trim())
  // On a tailored copy the rendered bullet may itself be the molded text
  // (edited since it was drafted from the story) — show it as a second card
  // only when it actually differs from the raw pointer, so nothing reads as
  // "molded" that wasn't.
  const molded = tailoredFor && bulletText.trim() !== story.pointer.trim() ? bulletText : null

  return (
    <aside className="tm-prov-rail" aria-label="The story behind this line">
      <div className="tm-prov-rail-eyebrow">The story behind this line</div>

      <div className="tm-prov-card">
        <div className="tm-prov-card-head">
          <span className="tm-prov-card-icon"><LIcon d={I.clock} size={12}/></span>
          <span className="tm-prov-card-label">From your past</span>
        </div>
        {role && <div className="tm-prov-role-co">{role.company || role.title}</div>}
        {role && <div className="tm-prov-role-title">{role.title}</div>}
        {role?.date_label && <div className="tm-prov-role-date">{role.date_label}</div>}
        <p className="tm-prov-raw">&ldquo;{story.pointer}&rdquo;</p>
        {narrative.length > 0 && (
          <dl className="tm-prov-star">
            {narrative.flatMap(([key, letter]) => [
              <dt key={`${key}-l`}>{letter}</dt>,
              <dd key={`${key}-v`}>{story.narrative[key]}</dd>,
            ])}
          </dl>
        )}
      </div>

      {molded && tailoredFor && (
        <>
          <div className="tm-prov-connector">
            <span className="tm-prov-connector-icon"><LIcon d={I.arrowDown} size={14}/></span>
            <span className="tm-prov-connector-text">molded for the job&apos;s language</span>
          </div>

          <div className="tm-prov-card molded">
            <div className="tm-prov-card-head">
              <span className="tm-prov-card-icon"><LIcon d={I.star} size={12}/></span>
              <span className="tm-prov-card-label">On your CV, for {tailoredFor.company}</span>
            </div>
            <p className="tm-prov-molded-text">{molded}</p>
            {matchedTerms.length > 0 && (
              <>
                <div className="tm-prov-terms-label">Matched to the job&apos;s words</div>
                <div className="tm-prov-terms">
                  {matchedTerms.map((t) => <span key={t} className="tm-prov-term">{t}</span>)}
                </div>
              </>
            )}
            <div className="tm-prov-actions">
              <button
                type="button"
                className="tm-prov-act primary"
                onClick={() => onOpenTailorWorkspace(tailoredFor.jobId)}
              >
                Edit in Tailor workspace →
              </button>
            </div>
          </div>
        </>
      )}

      <p className="tm-prov-foot">
        Nothing invented. Myro only rewords what you already did — into the
        language this job uses.
      </p>
    </aside>
  )
}
