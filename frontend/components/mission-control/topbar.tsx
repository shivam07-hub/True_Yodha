"use client"

import * as React from "react"
import { Icon } from "./icons"

interface TopbarProps {
  location: string
  refreshing: boolean
  refreshDisabled: boolean
  refreshNotice: string | null
  onRefresh: () => void
  onFeedback: () => void
  onOpenDiary: () => void
  cartCount: number
}

export function Topbar({
  location,
  refreshing,
  refreshDisabled,
  refreshNotice,
  onRefresh,
  onFeedback,
  onOpenDiary,
  cartCount,
}: TopbarProps) {
  return (
    <div className="mc-topbar">
      {location ? <span className="mc-topbar-loc">📍 {location}</span> : null}
      <button
        type="button"
        className="mc-btn tm-control-focus"
        onClick={onRefresh}
        disabled={refreshDisabled || refreshing}
        aria-label="Refresh job matches"
      >
        <Icon name="refresh" size={14} />
        {refreshing ? "Refreshing…" : "Refresh matches"}
        {refreshNotice ? <span className="mc-badge">{refreshNotice}</span> : <span className="mc-badge">−50 if new</span>}
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
