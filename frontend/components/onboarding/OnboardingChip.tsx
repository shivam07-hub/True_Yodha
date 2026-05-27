"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import "./onboarding-cards.css"
import { onboarding } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const HIDE_DAYS_AFTER_COMPLETE = 7
const STORAGE_KEY = "onb_chip_seen_complete_at"

interface Props {
  /** Force icon-only rendering (mobile top-bar). */
  iconOnly?: boolean
  /** Click handler — defaults to scrolling to the cluster on /home. */
  onClick?: () => void
}

export function OnboardingChip({ iconOnly = false, onClick }: Props) {
  const { token } = useAuth()
  const [hiddenPostComplete, setHiddenPostComplete] = useState(false)

  const { data: vm } = useQuery({
    queryKey: dataKeys.onboardingState(),
    queryFn: () => onboarding.state(token!).catch(() => null),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  const done = vm
    ? (Object.values(vm.milestones) as Array<string | null>).filter((v) => v !== null).length
    : 0
  const total = 3
  const complete = done === total

  useEffect(() => {
    if (typeof window === "undefined") return
    const seen = window.localStorage.getItem(STORAGE_KEY)
    if (!seen) return
    const ts = Number(seen)
    if (!Number.isFinite(ts)) return
    const ageMs = Date.now() - ts
    setHiddenPostComplete(ageMs < HIDE_DAYS_AFTER_COMPLETE * 24 * 60 * 60 * 1000)
  }, [])

  useEffect(() => {
    if (!complete) return
    if (typeof window === "undefined") return
    if (window.localStorage.getItem(STORAGE_KEY)) return
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
  }, [complete])

  if (!vm) return null
  if (complete && hiddenPostComplete) return null

  const fading = complete
  const pct = Math.round((done / total) * 100)
  const ringStyle = { ["--ring-pct" as string]: `${pct}%` } as React.CSSProperties

  function defaultScroll() {
    if (typeof window === "undefined") return
    const el = document.getElementById("tm-onb-head")
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <button
      type="button"
      className="tm-setup-chip"
      data-state={fading ? "fading" : "default"}
      data-icon-only={iconOnly ? "true" : "false"}
      onClick={onClick ?? defaultScroll}
      aria-label={`Onboarding ${done} of ${total} complete — open setup`}
    >
      <span className="ring" style={ringStyle} aria-hidden />
      {!iconOnly && <span className="label">Setup</span>}
      {!iconOnly && <span className="frac">{done}/{total}</span>}
    </button>
  )
}
