"use client"

import type { AgentPickItem } from "@/lib/api"
import "./agent-pick-lede.css"

/**
 * Myro's reason for a pick, rendered INSIDE the card it is about.
 *
 * It used to sit above the card as its own object, with its own rank marker and
 * a tier pill — so a pick read as two things, and the pill said "Strong" beside
 * a ring already saying "Worth it". The ring is the judge (CONTEXT.md Match
 * Verdict); this is the sentence, and it belongs to the card.
 *
 * The direction tag marks the EXCEPTION only. After the pick gate most picks are
 * on the direction the user chose, so labelling every one of them says nothing —
 * a tag appears when a pick is a pivot, and nowhere else. A pick nobody could
 * grade carries no tag either: absence is not a verdict.
 */
export function AgentPickLede({ pick }: { pick: AgentPickItem }) {
  if (!pick.agent_comment) return null
  return (
    <div className="tm-pick-lede">
      <span className="tm-pick-lede-rank">Pick {pick.agent_rank}</span>
      <p className="tm-pick-lede-why">{pick.agent_comment}</p>
      {pick.agent_direction === "off_direction" ? (
        <span className="tm-pick-lede-tag" title="Not the work you said you are aiming at">Pivot</span>
      ) : null}
    </div>
  )
}
