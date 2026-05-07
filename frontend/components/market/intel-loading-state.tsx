"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, Briefcase, ChartNetwork } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface IntelLoadingStateProps {
  message: string
}

interface LoadingStage {
  id: string
  label: string
  icon: LucideIcon
  keywords: string[]
}

const LOADING_STAGES: readonly LoadingStage[] = [
  { id: "agent", label: "Agent", icon: Bot, keywords: ["agent"] },
  { id: "jobs", label: "Jobs", icon: Briefcase, keywords: ["job"] },
  { id: "signals", label: "Signals", icon: ChartNetwork, keywords: ["skill", "signal"] },
] as const

function getActiveStageIndex(message: string) {
  const lower = message.toLowerCase()
  const match = LOADING_STAGES.findIndex((stage) =>
    stage.keywords.some((keyword) => lower.includes(keyword)),
  )
  return match >= 0 ? match : 0
}

export function IntelLoadingState({ message }: IntelLoadingStateProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [isInView, setIsInView] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)
  const activeStageIndex = useMemo(() => getActiveStageIndex(message), [message])
  const allowLoopingMotion = isInView && !reduceMotion

  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduceMotion(mediaQuery.matches)
    sync()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync)
      return () => mediaQuery.removeEventListener("change", sync)
    }

    mediaQuery.addListener(sync)
    return () => mediaQuery.removeListener(sync)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (typeof IntersectionObserver === "undefined") return
    if (!hostRef.current) return

    const observer = new IntersectionObserver(
      (entries) => setIsInView(entries[0]?.isIntersecting ?? true),
      { threshold: 0.15 },
    )
    observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={hostRef}
      role="status"
      aria-live="polite"
      aria-label={message}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: "30px 0 34px",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }} aria-hidden="true">
        {LOADING_STAGES.map((stage, index) => {
          const Icon = stage.icon
          const active = index === activeStageIndex
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
                border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                background: active ? "var(--tm-accent-wash)" : "var(--tm-surface)",
                color: active ? "var(--tm-accent)" : "var(--tm-text-faint)",
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
            "size-4 text-[var(--tm-accent)]",
            allowLoopingMotion ? "animate-spin" : "animate-none",
          )}
        />
        <span
          className="text-pretty"
          style={{
            color: "var(--tm-text-muted)",
            fontSize: "var(--tm-fs-meta)",
            lineHeight: "var(--tm-lh-meta)",
          }}
        >
          {message}
        </span>
      </div>

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
    </div>
  )
}
