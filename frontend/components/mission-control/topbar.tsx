"use client"

import * as React from "react"
import { Icon } from "./icons"
import type { UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"

interface TopbarProps {
  location: string
  refresh: UseJobRefreshResult
  onFeedback: () => void
  onOpenDiary: () => void
  cartCount: number
}

export function Topbar({
  location,
  refresh,
  onFeedback,
  onOpenDiary,
  cartCount,
}: TopbarProps) {
  const isWorking = refresh.state === "charging" || refresh.state === "computing"
  const cannotClick = isWorking || !refresh.canAfford
  const badge = isWorking
    ? refresh.progressLabel ?? "Working…"
    : refresh.state === "done" && refresh.matchesWritten != null
      ? `+${refresh.matchesWritten} new · −${refresh.cost} XP`
      : refresh.errorMessage
        ? refresh.errorMessage
        : `−${refresh.cost} XP if new`
  return (
    <div className="mc-topbar">
      {location ? <span className="mc-topbar-loc">📍 {location}</span> : null}
      <button
        type="button"
        className="mc-btn tm-control-focus"
        onClick={refresh.refresh}
        disabled={cannotClick}
        aria-label="Refresh job matches"
      >
        <Icon name="refresh" size={14} />
        {isWorking ? (refresh.progressLabel ?? "Refreshing…") : "Refresh matches"}
        <span className="mc-badge">{badge}</span>
      </button>
      <button
        type="button"
        className="mc-btn mc-btn-feedback tm-control-focus"
        onClick={onFeedback}
        aria-label="Send feedback"
        title="Open feedback (⌘/)"
      >
        <Icon name="target" size={14} />
        Feedback
        <span className="mc-kbd">⌘/</span>
      </button>
      <button
        type="button"
        className="mc-btn tm-control-focus"
        onClick={onOpenDiary}
        aria-label="Open diary and cart"
      >
        <Icon name="diary" size={14} />
        Diary + cart
        {cartCount > 0 ? <span className="mc-badge">{cartCount}</span> : null}
      </button>
    </div>
  )
}
