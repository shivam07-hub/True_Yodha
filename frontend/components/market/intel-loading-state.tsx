"use client"

import { Bot, Briefcase, ChartNetwork } from "lucide-react"
import { ProcessLoading, type ProcessLoadingStage } from "@/components/loading/process-loading"

interface IntelLoadingStateProps {
  message: string
}

const INTEL_LOADING_STAGES: readonly ProcessLoadingStage[] = [
  { id: "agent", label: "Agent", icon: Bot, keywords: ["agent"] },
  { id: "jobs", label: "Jobs", icon: Briefcase, keywords: ["job"] },
  { id: "signals", label: "Signals", icon: ChartNetwork, keywords: ["skill", "signal"] },
] as const

export function IntelLoadingState({ message }: IntelLoadingStateProps) {
  return (
    <ProcessLoading
      message={message}
      stages={INTEL_LOADING_STAGES}
      inferActiveStageFromMessage
      showSkeleton
    />
  )
}
