"use client"

import { useMemo, useRef } from "react"
import type { CSSProperties } from "react"
import type { LucideIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { useAllowLoopingMotion } from "@/lib/hooks/use-allow-looping-motion"

export interface ProcessLoadingStage {
  id: string
  label: string
  icon: LucideIcon
  description?: string
  keywords?: readonly string[]
}

interface ProcessLoadingProps {
  message: string
  stages: readonly ProcessLoadingStage[]
  activeStageIndex?: number
  inferActiveStageFromMessage?: boolean
  showSkeleton?: boolean
  showActiveStageDetail?: boolean
  timingHint?: string
  size?: "default" | "compact"
  className?: string
  style?: CSSProperties
}

function inferStageIndex(message: string, stages: readonly ProcessLoadingStage[]) {
  const lower = message.toLowerCase()
  const match = stages.findIndex((stage) =>
    stage.keywords?.some((keyword) => lower.includes(keyword)),
  )
  return match >= 0 ? match : 0
}

export function ProcessLoading({
  message,
  stages,
  activeStageIndex,
  inferActiveStageFromMessage = false,
  showSkeleton = false,
  showActiveStageDetail = false,
  timingHint,
  size = "default",
  className,
  style,
}: ProcessLoadingProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const allowLoopingMotion = useAllowLoopingMotion(hostRef)
  const resolvedStageIndex = useMemo(() => {
    if (typeof activeStageIndex === "number") {
      return Math.max(0, Math.min(activeStageIndex, stages.length - 1))
    }
    if (inferActiveStageFromMessage) return inferStageIndex(message, stages)
    return 0
  }, [activeStageIndex, inferActiveStageFromMessage, message, stages])

  const activeStage = stages[resolvedStageIndex]
  const compact = size === "compact"

  return (
    <div
      ref={hostRef}
      role="status"
      aria-live="polite"
      aria-label={activeStage ? `${message}. ${activeStage.label}` : message}
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? 10 : 14,
        padding: compact ? "20px 0 4px" : "30px 0 34px",
        textAlign: "center",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }} aria-hidden="true">
        {stages.map((stage, index) => {
          const Icon = stage.icon
          const active = index === resolvedStageIndex
          return (
            <div
              key={stage.id}
              title={stage.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: `1px solid ${active ? "var(--tm-int-border)" : "var(--tm-border-soft)"}`,
                background: active ? "var(--tm-int-bg-wash)" : "var(--tm-surface)",
                color: active ? "var(--tm-interactive)" : "var(--tm-text-faint)",
                transform: active ? "translateY(-2px) scale(1.03)" : "none",
                opacity: active ? 1 : 0.7,
                transition: "transform var(--tm-dur) var(--tm-ease), opacity var(--tm-dur) var(--tm-ease), color var(--tm-dur) var(--tm-ease), background-color var(--tm-dur) var(--tm-ease), border-color var(--tm-dur) var(--tm-ease)",
              }}
            >
              <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
            </div>
          )
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 24 }}>
        <Spinner
          aria-hidden="true"
          className={cn(
            "size-4 text-[var(--tm-interactive)]",
            allowLoopingMotion ? "animate-spin" : "animate-none",
          )}
        />
        <span
          className="text-pretty"
          style={{
            color: "var(--tm-text-muted)",
            fontSize: compact ? "var(--tm-fs-caption)" : "var(--tm-fs-meta)",
            lineHeight: compact ? "var(--tm-lh-caption)" : "var(--tm-lh-meta)",
          }}
        >
          {message}
        </span>
      </div>

      {showActiveStageDetail && activeStage?.description && (
        <span
          className="text-pretty"
          style={{
            color: "var(--tm-text-faint)",
            fontSize: "var(--tm-fs-caption)",
            lineHeight: "var(--tm-lh-caption)",
            maxWidth: 360,
          }}
        >
          {activeStage.description}
        </span>
      )}

      {showSkeleton && (
        <div
          aria-hidden="true"
          style={{
            width: "min(360px, calc(100vw - 64px))",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <Skeleton className={cn("h-2 w-full", allowLoopingMotion ? "animate-pulse" : "animate-none")} />
          <Skeleton className={cn("h-2 w-3/4", allowLoopingMotion ? "animate-pulse" : "animate-none")} />
        </div>
      )}

      {timingHint && (
        <span
          style={{
            color: "var(--tm-text-faint)",
            fontSize: 11,
            letterSpacing: "0.04em",
          }}
        >
          {timingHint}
        </span>
      )}
    </div>
  )
}
