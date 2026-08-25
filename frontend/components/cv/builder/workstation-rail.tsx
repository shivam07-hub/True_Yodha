/**
 * WorkstationRail — the right rail on all three CV surfaces.
 *
 * Order, top to bottom (handoff §4):
 *   1  `Fixes · N` / `Skills · N gaps` toggle
 *   2  triage numerals — three tiles, tappable as filters
 *   3  the issue queue — content fixes AND failing ATS rows, one list
 *   4  `✓ N ATS checks pass · see all ▾`
 *   5  the actions the pane toolbar gave up (Tailor with Mentor · Restructure)
 *
 * When the queue empties, the toggle collapses into a 34px strip and the other
 * lane takes the rail (§5). Logged out there is no other lane, so the rail
 * becomes the terminal card instead.
 *
 * This replaces both FixesRail and the old PlaygroundRail. Pure composition —
 * every piece of state lives in the surface that mounts it.
 */
"use client"

import { useState, type ReactNode } from "react"
import type { AtsCheck } from "./ats-checks"
import type { Severity } from "./cv-severity"
import type { Issue, TriageCounts } from "./issue-model"
import { CvAtsStrip } from "./cv-ats-strip"
import { CvClearStrip } from "./cv-rail-clear"
import { CvIssueQueue } from "./cv-issue-queue"
import { CvTriageTiles } from "./cv-triage-tiles"

export interface WorkstationRailProps {
  ariaLabel: string
  tab: "fixes" | "skills"
  onTab: (tab: "fixes" | "skills") => void
  /** null ⇒ this surface has no second lane, so no toggle renders. */
  skillsLabel: string | null
  skillsPane?: ReactNode
  issues: Issue[]
  counts: TriageCounts
  activeIssueId: string | null
  /** Row expanded to its free brief. Expanding reaches no network. */
  openIssueId: string | null
  onToggleIssue: (issue: Issue) => void
  /** Go to the line and open the fix there. */
  onGoIssue: (issue: Issue) => void
  onDismissIssue?: (issue: Issue) => void
  atsChecks: AtsCheck[]
  atsPassed: number
  /** Severity filter, owned by the shell — the phone chip row is the same
   *  control at a different size, and two owners of one filter is two filters. */
  filter: Severity | null
  onFilter: (severity: Severity | null) => void
  /** Fixes closed this session — the clear strip's receipt. */
  fixedCount: number
  /** Rendered in place of the queue when everything is clear and there is no
   *  Skills lane to hand the rail to. */
  terminal?: ReactNode
  footer?: ReactNode
}

export function WorkstationRail({
  ariaLabel, tab, onTab, skillsLabel, skillsPane, issues, counts,
  activeIssueId, openIssueId, onToggleIssue, onGoIssue, onDismissIssue,
  atsChecks, atsPassed, filter, onFilter,
  fixedCount, terminal, footer,
}: WorkstationRailProps) {
  const [reviewing, setReviewing] = useState(false)
  const clear = issues.length === 0
  const shown = filter ? issues.filter(i => i.severity === filter) : issues

  return (
    <aside className="cvb-v2-rail" aria-label={ariaLabel}>
      {clear ? (
        <CvClearStrip
          fixedCount={fixedCount}
          reviewing={reviewing}
          onReview={atsPassed > 0 ? () => setReviewing(r => !r) : undefined}
        />
      ) : skillsLabel ? (
        <div className="cvw-railtabs" role="tablist" aria-label="Rail lane">
          <button
            type="button"
            role="tab"
            className="cvw-railtab"
            aria-selected={tab === "fixes"}
            onClick={() => onTab("fixes")}
          >Fixes · {issues.length}</button>
          <button
            type="button"
            role="tab"
            className="cvw-railtab"
            aria-selected={tab === "skills"}
            onClick={() => onTab("skills")}
          >{skillsLabel}</button>
        </div>
      ) : null}

      <div className="cvb-v2-railbody">
        {clear ? (
          <>
            {reviewing && <CvAtsStrip checks={atsChecks} passed={atsPassed} />}
            {skillsPane ?? terminal}
          </>
        ) : tab === "skills" && skillsPane ? (
          skillsPane
        ) : (
          <>
            <CvTriageTiles counts={counts} filter={filter} onFilter={onFilter} />
            <CvIssueQueue
              issues={shown}
              activeId={activeIssueId}
              openId={openIssueId}
              onToggle={onToggleIssue}
              onGo={onGoIssue}
              onDismiss={onDismissIssue}
              emptyNote={filter ? `Nothing ${filter} left — clear the filter to see the rest.` : undefined}
            />
            <CvAtsStrip checks={atsChecks} passed={atsPassed} />
          </>
        )}
      </div>

      {footer && <div className="cvw-railfoot">{footer}</div>}
    </aside>
  )
}
