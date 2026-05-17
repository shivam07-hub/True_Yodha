"use client"

import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
import { ApplicationCard } from "./ApplicationCard"
import { STAGE_LABEL, STAGE_ROMAN } from "./useTrackerBoard"
import type { StageKey } from "./useTrackerBoard"

interface Props {
  stage: StageKey
  apps: ApplicationResponse[]
  stuckJobIds: Set<string>
  sparkleJobId: string | null
  sparkleTrigger: number
  onStatusChange: (jobId: string, status: ApplicationStatus) => void
  onWithdraw: (jobId: string) => void
  onDelete: (jobId: string) => void
  onNotesChange: (jobId: string, notes: string) => void
}

export function StageColumn({
  stage, apps, stuckJobIds, sparkleJobId, sparkleTrigger,
  onStatusChange, onWithdraw, onDelete, onNotesChange,
}: Props) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 10,
        minHeight: 200,
        background: "rgba(255,255,255,0.01)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: 12, padding: "14px 10px",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 4px 8px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <span style={{
          fontFamily: "var(--tm-font-serif, var(--tm-font-mono))",
          fontSize: 14, fontWeight: 600, color: "var(--tm-text-faint)",
        }}>
          {STAGE_ROMAN[stage]}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "-0.01em" }}>
          {STAGE_LABEL[stage]}
        </span>
        <span style={{
          marginLeft: "auto",
          fontFamily: "var(--tm-font-mono)", fontSize: 11,
          color: "var(--tm-text-faint)",
        }}>
          {apps.length}
        </span>
      </header>

      {apps.length === 0 ? (
        <div style={{
          padding: "24px 12px", textAlign: "center", borderRadius: 8,
          border: "1px dashed var(--tm-border)",
          fontSize: 12, color: "var(--tm-text-faint)",
        }}>
          empty
        </div>
      ) : (
        apps.map(app => (
          <ApplicationCard
            key={app.id}
            app={app}
            isStuck={stuckJobIds.has(app.job_id)}
            isManual={app.source === "manual_web"}
            sparkleTrigger={sparkleJobId === app.job_id ? sparkleTrigger : 0}
            onStatusChange={(s) => onStatusChange(app.job_id, s)}
            onWithdraw={() => onWithdraw(app.job_id)}
            onDelete={() => onDelete(app.job_id)}
            onNotesChange={(notes) => onNotesChange(app.job_id, notes)}
          />
        ))
      )}
    </div>
  )
}
