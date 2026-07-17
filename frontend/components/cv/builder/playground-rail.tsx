/**
 * PlaygroundRail — CV Playground v2 right rail: Fixes / Job fit tab bar + the
 * active pane. The Job-fit tab is the Lane C coverage map (what this job wants,
 * matched against the user's stories + CV); it opens Tailor with Mentor.
 * Preview lives in the main editor pane (playground-view), not here. Pure
 * composition — all state and data stay in the view.
 */
"use client"

import { FixesRail } from "./fixes-rail"
import { CoveragePanel } from "./coverage-panel"
import type { AppliedFix, V2Fix } from "./fix-model"
import type { JDCoverageResponse } from "@/lib/api"

interface PlaygroundRailProps {
  token: string
  tab: "fixes" | "skills"
  /** Non-dismissed open fixes — what the Fixes tab renders as cards. */
  fixes: V2Fix[]
  /** Dismissed-but-still-open fixes — the collapsed Restore group. */
  dismissedFixes: V2Fix[]
  applied: AppliedFix[]
  expandedId: string | null
  applying: boolean
  fixCountLabel: string
  coverage: JDCoverageResponse | undefined
  coverageLoading: boolean
  coverageError: boolean
  onTab: (tab: "fixes" | "skills") => void
  onGoPreview: () => void
  onExpand: (fix: V2Fix | null) => void
  onJump: (iid: string) => void
  onApplyFix: (fix: V2Fix, oldText: string, newText: string) => void
  onDismissFix: (fix: V2Fix) => void
  onRestoreFix: (fix: V2Fix) => void
  onOpenIntake: (seed?: string) => void
  onOpenWeave: () => void
  onRetryCoverage: () => void
}

export function PlaygroundRail({
  token, tab, fixes, dismissedFixes, applied, expandedId, applying,
  fixCountLabel, coverage, coverageLoading, coverageError, onTab, onGoPreview,
  onExpand, onJump, onApplyFix, onDismissFix, onRestoreFix, onOpenIntake,
  onOpenWeave, onRetryCoverage,
}: PlaygroundRailProps) {
  const fitLabel = coverage ? `${coverage.covered}/${coverage.requirements.length}` : "·"
  return (
    <aside className="cvb-v2-rail" aria-label="Job fit">
      <div className="cvb-v2-railtabs">
        <button
          type="button"
          className={`cvb-v2-tabbtn${tab === "fixes" ? " active" : ""}`}
          onClick={() => onTab("fixes")}
        >Fixes · {fixCountLabel}</button>
        <button
          type="button"
          className={`cvb-v2-tabbtn${tab === "skills" ? " active" : ""}`}
          onClick={() => onTab("skills")}
        >Job fit · {fitLabel}</button>
      </div>
      <div className="cvb-v2-railbody">
        {tab === "fixes" && (
          <FixesRail
            token={token}
            fixes={fixes}
            applied={applied}
            dismissed={dismissedFixes}
            delta={applied.reduce((s, a) => s + a.gain, 0)}
            expandedId={expandedId}
            applying={applying}
            onExpand={onExpand}
            onJump={onJump}
            onApply={onApplyFix}
            onDismiss={onDismissFix}
            onRestore={onRestoreFix}
            onGoPreview={onGoPreview}
            onOpenIntake={() => onOpenIntake()}
          />
        )}
        {tab === "skills" && (
          <CoveragePanel
            coverage={coverage}
            loading={coverageLoading}
            error={coverageError}
            onOpenWeave={onOpenWeave}
            onRetry={onRetryCoverage}
          />
        )}
      </div>
    </aside>
  )
}
