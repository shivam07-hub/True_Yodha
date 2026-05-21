"use client"

import { Bot, BriefcaseBusiness, ChartNetwork } from "lucide-react"
import { ProcessLoading, type ProcessLoadingStage } from "@/components/loading/process-loading"
import { MyroLogo } from "@/components/myro-logo"

const DEFAULT_STAGES: readonly ProcessLoadingStage[] = [
  { id: "init", label: "Session", icon: Bot, keywords: ["session", "auth", "sign", "init"] },
  { id: "process", label: "Processing", icon: BriefcaseBusiness, keywords: ["process", "parse", "upload", "analyse"] },
  { id: "complete", label: "Finalising", icon: ChartNetwork, keywords: ["final", "complete", "ready", "done"] },
]

interface FlowStepLoadingProps {
  step?: string
  message?: string
  stages?: readonly ProcessLoadingStage[]
}

export function FlowStepLoading({
  step,
  message = "Loading…",
  stages = DEFAULT_STAGES,
}: FlowStepLoadingProps) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--tm-bg)",
        color: "var(--tm-text)",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div style={{ filter: "drop-shadow(0 0 12px var(--tm-accent-glow))" }} aria-hidden="true">
          <MyroLogo size={74} />
        </div>
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              color: "var(--tm-text)",
              fontFamily: "var(--tm-font-sans)",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "var(--tm-tracking-tight)",
            }}
          >
            MYRO
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              color: "var(--tm-text-faint)",
              fontFamily: "var(--tm-font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Career Intelligence
          </p>
        </div>

        <ProcessLoading
          message={step ? `${message} · ${step}` : message}
          stages={stages}
          inferActiveStageFromMessage
          showSkeleton
          style={{ width: "100%", paddingTop: 10 }}
        />
      </div>
    </main>
  )
}
