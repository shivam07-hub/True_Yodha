"use client"

import { Bot, BriefcaseBusiness, ChartNetwork } from "lucide-react"
import { MyroLogo } from "@/components/myro-logo"
import { ProcessLoading, type ProcessLoadingStage } from "@/components/loading/process-loading"

const APP_LOADING_STAGES: readonly ProcessLoadingStage[] = [
  { id: "session", label: "Session", icon: Bot, keywords: ["session", "auth", "profile"] },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness, keywords: ["job", "market", "workspace"] },
  { id: "signals", label: "Signals", icon: ChartNetwork, keywords: ["skill", "signal", "intel"] },
]

interface LoadingPageProps {
  message?: string
}

export function LoadingPage({ message = "Preparing Myro…" }: LoadingPageProps) {
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
          message={message}
          stages={APP_LOADING_STAGES}
          inferActiveStageFromMessage
          showSkeleton
          style={{ width: "100%", paddingTop: 10 }}
        />
      </div>
    </main>
  )
}
