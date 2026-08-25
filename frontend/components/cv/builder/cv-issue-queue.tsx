/**
 * CvIssueQueue — rank 3. One row per open issue, and nothing else.
 *
 * `3px 1fr auto`: severity gutter · title (12.5/600) + provenance (10 mono
 * uppercase) · chevron. The row carries no description paragraph, no `bullet →`
 * quote of the line it points at, and no inline rewrite — all three were in the
 * old fix card, all three duplicated something the CV pane already shows, and
 * together they made a five-issue rail scroll past two screens.
 *
 * The active row takes the accent gutter, the accent ring and `open on the
 * line →`, because the rewrite happens over there.
 *
 * ATS rows live in this same list (§4.4) and are actionable on every surface,
 * including logged out — the old anon ATS tab rendered a red ✗ the user could
 * not do anything about.
 */
"use client"

import type { Issue } from "./issue-model"

interface CvIssueQueueProps {
  issues: Issue[]
  /** Id of the issue whose line is currently open in the CV pane. */
  activeId: string | null
  onOpen: (issue: Issue) => void
  emptyNote?: string
}

export function CvIssueQueue({ issues, activeId, onOpen, emptyNote }: CvIssueQueueProps) {
  if (issues.length === 0) {
    return emptyNote ? <p className="cvw-queue cvw-issue-prov">{emptyNote}</p> : null
  }
  return (
    <div className="cvw-queue">
      {issues.map(issue => {
        const active = issue.id === activeId
        return (
          <button
            key={issue.id}
            type="button"
            className="cvw-issue"
            data-sev={issue.severity}
            data-active={active}
            onClick={() => onOpen(issue)}
          >
            <span className="cvw-gutter" aria-hidden />
            <span className="cvw-issue-body">
              <span className="cvw-issue-title">{issue.title}</span>
              {/* The active row swaps provenance for the handoff: the line is
                  already open over in the pane, so where it lives is no longer
                  the useful fact — where to look is. */}
              {active
                ? <span className="cvw-issue-prov cvw-issue-open">open on the line →</span>
                : issue.provenance
                  ? <span className="cvw-issue-prov">{issue.provenance}</span>
                  : null}
            </span>
            {active
              ? <span className="cvw-issue-dot" aria-hidden />
              : <span className="cvw-issue-act">{issue.action ?? "›"}</span>}
          </button>
        )
      })}
    </div>
  )
}
