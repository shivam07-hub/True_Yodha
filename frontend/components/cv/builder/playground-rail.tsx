/**
 * PlaygroundRail — CV Playground v2 right rail: Fixes / Skills tab bar + the
 * active pane (Preview mounts here too, toggled from the editor toolbar).
 * Pure composition — all state and data stay in the view.
 */
"use client"

import type { CVStructured } from "@/lib/api"
import type { PageFill } from "@/lib/cv/page-fill"
import { FixesRail } from "./fixes-rail"
import { SkillsRail } from "./skills-rail"
import { PreviewRail, type SheetContact } from "./preview-rail"
import type { AppliedFix, V2Fix } from "./fix-model"
import type { usePlaygroundModel } from "./use-playground-model"

type Model = ReturnType<typeof usePlaygroundModel>

interface PlaygroundRailProps {
  token: string
  tab: "fixes" | "skills" | "preview"
  model: Model
  cv: CVStructured
  hidden: Set<string>
  contact: SheetContact
  pageFill: PageFill
  applied: AppliedFix[]
  expandedId: string | null
  applying: boolean
  canApply: boolean
  fixCountLabel: string
  onTab: (tab: "fixes" | "skills" | "preview") => void
  onExpand: (fix: V2Fix | null) => void
  onJump: (iid: string) => void
  onApplyFix: (fix: V2Fix, oldText: string, newText: string) => void
  onFixCard: (fix: V2Fix) => void
  onOpenIntake: (seed?: string) => void
  onDownload: () => void
  onApplyCV: () => void
}

export function PlaygroundRail({
  token, tab, model: m, cv, hidden, contact, pageFill, applied, expandedId, applying,
  canApply, fixCountLabel, onTab, onExpand, onJump, onApplyFix, onFixCard, onOpenIntake,
  onDownload, onApplyCV,
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
            onGoPreview={() => onTab("preview")}
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
        {tab === "preview" && (
          <PreviewRail
            cv={cv}
            hidden={hidden}
            contact={contact}
            baseScore={m.baseScore}
            ready={m.ready}
            delta={m.delta}
            company={m.company}
            pageFill={pageFill}
            onDownload={onDownload}
            onApply={onApplyCV}
            canApply={canApply}
          />
        )}
      </div>
    </aside>
  )
}
