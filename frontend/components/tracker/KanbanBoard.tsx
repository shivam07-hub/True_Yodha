"use client"

import { APPLICATION_STAGES, type ApplicationResponse, type ApplicationStatus } from "@/lib/api"
import { StageColumn } from "./StageColumn"
import { partitionByStage } from "./useTrackerBoard"
import type { StageKey } from "./useTrackerBoard"

interface Props {
  apps: ApplicationResponse[]
  stuckJobIds: Set<string>
  sparkleJobId: string | null
  sparkleTrigger: number
  onStatusChange: (jobId: string, status: ApplicationStatus) => void
  onWithdraw: (jobId: string) => void
  onDelete: (jobId: string) => void
  onNotesChange: (jobId: string, notes: string) => void
}

export function KanbanBoard(props: Props) {
  const byStage = partitionByStage(props.apps)
  return (
    <div
      className="tm-tracker-board"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 14,
        alignItems: "start",
      }}
    >
      {(APPLICATION_STAGES as readonly StageKey[]).map(stage => (
        <StageColumn
          key={stage}
          stage={stage}
          apps={byStage[stage]}
          stuckJobIds={props.stuckJobIds}
          sparkleJobId={props.sparkleJobId}
          sparkleTrigger={props.sparkleTrigger}
          onStatusChange={props.onStatusChange}
          onWithdraw={props.onWithdraw}
          onDelete={props.onDelete}
          onNotesChange={props.onNotesChange}
        />
      ))}
    </div>
  )
}
