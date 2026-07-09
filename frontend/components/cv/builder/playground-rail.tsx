/**
 * PlaygroundRail — CV Playground v2 right rail: Fixes / Skills tab bar + the
 * active pane. Preview lives in the main editor pane (playground-view), not
 * here — a WYSIWYG sheet needs the editor's full width to read as an actual
 * CV, not a squeezed sidebar. `onGoPreview` still routes there.
 * Pure composition — all state and data stay in the view.
 */
"use client"

import { FixesRail } from "./fixes-rail"
import { SkillsRail } from "./skills-rail"
import type { AppliedFix, V2Fix } from "./fix-model"
import type { usePlaygroundModel } from "./use-playground-model"

type Model = ReturnType<typeof usePlaygroundModel>

interface PlaygroundRailProps {
  token: string
  tab: "fixes" | "skills"
  model: Model
  applied: AppliedFix[]
  expandedId: string | null
  applying: boolean
  fixCountLabel: string
  onTab: (tab: "fixes" | "skills") => void
  onGoPreview: () => void
  onExpand: (fix: V2Fix | null) => void
  onJump: (iid: string) => void
  onApplyFix: (fix: V2Fix, oldText: string, newText: string) => void
  onFixCard: (fix: V2Fix) => void
  onOpenIntake: (seed?: string) => void
}

export function PlaygroundRail({
  token, tab, model: m, applied, expandedId, applying,
  fixCountLabel, onTab, onGoPreview, onExpand, onJump, onApplyFix, onFixCard, onOpenIntake,
}: PlaygroundRailProps) {
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
        >Skills · {m.coveredCount}/{m.skillRows.length || m.allTargets.length}</button>
      </div>
      <div className="cvb-v2-railbody">
        {tab === "fixes" && (
          <FixesRail
            token={token}
            fixes={m.openFixes}
            applied={applied}
            delta={m.delta}
            expandedId={expandedId}
            applying={applying}
            onExpand={onExpand}
            onJump={onJump}
            onApply={onApplyFix}
            onGoPreview={onGoPreview}
            onOpenIntake={() => onOpenIntake()}
          />
        )}
        {tab === "skills" && (
          <SkillsRail
            token={token}
            rows={m.skillRows}
            coveredCount={m.coveredCount}
            total={m.skillRows.length || m.allTargets.length}
            onFix={onFixCard}
            onAdd={onOpenIntake}
          />
        )}
      </div>
    </aside>
  )
}
