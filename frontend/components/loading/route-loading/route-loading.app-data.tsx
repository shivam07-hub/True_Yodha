"use client"

import type { ReactNode } from "react"
import { FailureFallback } from "./http-status-fallback"
import { useBackendStatus } from "./use-backend-status"
import { AppShellSkeleton } from "./skeleton-mirrors/app-shell-skeleton"
import { ProfileSkeleton } from "./skeleton-mirrors/profile-skeleton"

const SKELETON_MIRRORS: Record<string, () => ReactNode> = {
  "app-shell": () => <AppShellSkeleton />,
  profile: () => <ProfileSkeleton />,
}

interface AppDataLoadingProps {
  route?: string
  queryError?: unknown
  fallback?: ReactNode
  onRetry?: () => void
}

export function AppDataLoading({ route, queryError, fallback, onRetry }: AppDataLoadingProps) {
  const backend = useBackendStatus()

  // Any settled error — HTTP status, timeout, offline, or network — renders a
  // named failure. Previously only errors with an HTTP status were caught, so a
  // timeout/offline fell through to a silent (effectively frozen) skeleton.
  if (queryError) {
    return <FailureFallback error={queryError} onRetry={onRetry} />
  }

  if (backend.status === "degraded") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 240,
          gap: 12,
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--tm-text-muted)", fontFamily: "var(--tm-font-sans)" }}>
          Service is temporarily unavailable
        </span>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "1px solid var(--tm-border)",
              background: "var(--tm-surface)",
              color: "var(--tm-interactive)",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--tm-font-sans)",
            }}
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (fallback) return <>{fallback}</>

  const skeletonKey = route ?? "app-shell"
  const SkeletonFn = SKELETON_MIRRORS[skeletonKey] ?? SKELETON_MIRRORS["app-shell"]
  return <>{SkeletonFn()}</>
}
