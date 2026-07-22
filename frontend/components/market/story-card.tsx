"use client"

import { CompanyLink } from "@/components/companies/company-link"
import "./market-intel.css"

/**
 * A teaching card interleaved into the job feed (Inshorts-tight). Two kinds —
 * a skill-demand mover and a company pulse — each leads with one market lesson
 * and routes via an EXISTING action (track skill · see roles), never a new one.
 */
export type FeedStory =
  /** `roles` is live listings in `city`, `companies` the distinct employers
   *  behind them — market-wide, not the viewer's matches. The previous shape
   *  carried a CV `level` that was hard-coded to 0 for every viewer, so the card
   *  told everyone "You're at L0"; a fact we don't have here is now absent
   *  rather than invented. */
  | { kind: "skill"; skill: string; roles: number; companies: number; city: string | null }
  | { kind: "company"; company: string; openCount: number; location: string | null; followed: boolean }

export function StoryCard({
  story, onPrimary, onSecondary,
}: {
  story: FeedStory
  onPrimary: () => void
  onSecondary: () => void
}) {
  if (story.kind === "skill") {
    return (
      <article className="mi-story" aria-label={`Skill in demand: ${story.skill}`}>
        <div className="mi-story-kicker">Skill in demand</div>
        <h3 className="mi-story-h">
          <span className="mi-accent">{story.skill}</span> — {story.roles} open role
          {story.roles === 1 ? "" : "s"}{story.city ? ` in ${story.city}` : ""} want it
        </h3>
        <p className="mi-story-p">
          Across {story.companies} employer{story.companies === 1 ? "" : "s"} hiring right now.
        </p>
        <div className="mi-story-cta">
          <button type="button" className="mi-go" onClick={onPrimary}>Track skill →</button>
          <button type="button" className="mi-quiet" onClick={onSecondary}>see {story.roles} roles</button>
        </div>
      </article>
    )
  }
  return (
    <article className="mi-story" aria-label={`Hiring now: ${story.company}`}>
      <div className="mi-story-kicker">Hiring now</div>
      <h3 className="mi-story-h">
        <CompanyLink company={story.company} className="mi-accent" /> opened {story.openCount} role{story.openCount === 1 ? "" : "s"}
        {story.location ? ` in ${story.location}` : ""}
      </h3>
      <div className="mi-story-cta">
        <button type="button" className="mi-go" onClick={onPrimary}>
          See {story.openCount} role{story.openCount === 1 ? "" : "s"} →
        </button>
        <button type="button" className="mi-quiet" onClick={onSecondary}>
          {story.followed ? "following ✓" : "follow"}
        </button>
      </div>
    </article>
  )
}
