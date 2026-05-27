"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import "./onboarding-cards.css"
import { onboarding, type OnboardingMilestoneKey, type OnboardingStateResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

interface CardCopy {
  key: OnboardingMilestoneKey
  idx: number
  eyebrow: string
  title: string
  outcome: string
  deeplinkLabel: string
  href: (vm: OnboardingStateResponse, savedJobId: string | null) => string
}

const CARDS: CardCopy[] = [
  {
    key: "skill_map_viewed",
    idx: 1,
    eyebrow: "Step 1 · Skill map",
    title: "See your skill map",
    outcome: "10 domains scored from your CV",
    deeplinkLabel: "/skills",
    href: () => "/skills",
  },
  {
    key: "first_job_saved",
    idx: 2,
    eyebrow: "Step 2 · Target",
    title: "Save a target job",
    outcome: "Pin 1 job to start tracking",
    deeplinkLabel: "/jobs",
    href: () => "/jobs",
  },
  {
    key: "first_tailored_cv",
    idx: 3,
    eyebrow: "Step 3 · Tailor",
    title: "Tailor your CV for that job",
    outcome: "Score your CV against the JD",
    deeplinkLabel: "/cv?jobId=…",
    href: (_vm, savedJobId) => `/cv${savedJobId ? `?jobId=${savedJobId}` : ""}`,
  },
]

type CardState = "active" | "done" | "locked"

interface Props {
  /** Optional jobId hint for Card 3 deeplink (e.g. user's most recent saved job). */
  savedJobId?: string | null
  /** Optional first name for the success card greeting. */
  firstName?: string
  /** Hide the success toast (e.g. when caller renders its own XP toasts). */
  suppressToast?: boolean
}

export function OnboardingCards({ savedJobId = null, firstName = "there", suppressToast = false }: Props) {
  const { token } = useAuth()
  const [dismissedThisSession, setDismissedThisSession] = useState(false)
  const [longPressToast, setLongPressToast] = useState<string | null>(null)
  const [mobileCollapsed, setMobileCollapsed] = useState(true)
  const [showCompletionToast, setShowCompletionToast] = useState(false)
  const prevDoneCountRef = useRef<number | null>(null)

  const { data: vm } = useQuery({
    queryKey: dataKeys.onboardingState(),
    queryFn: () => onboarding.state(token!).catch(() => null),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    function onTick() {
      // Caller fires window.dispatchEvent(new Event("milestone-tick"))
      // after any user action expected to flip a milestone.
      window.dispatchEvent(new CustomEvent("onb-refetch-request"))
    }
    window.addEventListener("milestone-tick", onTick)
    return () => window.removeEventListener("milestone-tick", onTick)
  }, [])

  const milestones = vm?.milestones
  const done = useMemo(() => {
    if (!milestones) return 0
    return (Object.values(milestones) as Array<string | null>).filter((v) => v !== null).length
  }, [milestones])

  // Detect completion transition (2 → 3) to fire the XP toast.
  useEffect(() => {
    const prev = prevDoneCountRef.current
    prevDoneCountRef.current = done
    if (prev === 2 && done === 3 && vm?.xp_granted && !suppressToast) {
      setShowCompletionToast(true)
      const id = setTimeout(() => setShowCompletionToast(false), 4200)
      return () => clearTimeout(id)
    }
    return
  }, [done, vm?.xp_granted, suppressToast])

  if (!vm || !milestones) return null
  if (dismissedThisSession) return null

  const states: Record<OnboardingMilestoneKey, CardState> = {
    skill_map_viewed: milestones.skill_map_viewed ? "done" : "active",
    first_job_saved: milestones.first_job_saved ? "done" : "active",
    first_tailored_cv: milestones.first_tailored_cv
      ? "done"
      : milestones.first_job_saved
        ? "active"
        : "locked",
  }

  function handleDismiss() {
    setDismissedThisSession(true)
    if (token) void onboarding.dismiss(token).catch(() => {})
  }

  function handleLockedTap() {
    setLongPressToast("Save a job first.")
    setTimeout(() => setLongPressToast(null), 1800)
  }

  const pct = Math.round((done / 3) * 100)
  const ringStyle = { ["--ring-pct" as string]: `${pct}%` } as React.CSSProperties

  // Completion morph: render success card in place
  if (done === 3) {
    return (
      <>
        <SuccessCard firstName={firstName} amount={vm.xp_grant_amount ?? 500} />
        {showCompletionToast && !suppressToast && <CompletionToast amount={vm.xp_grant_amount ?? 500} />}
      </>
    )
  }

  return (
    <>
      <section
        className="tm-onb-wrap"
        role="region"
        aria-labelledby="tm-onb-head"
        data-mobile-collapsed={mobileCollapsed ? "true" : "false"}
      >
        {/* Mobile banner-collapsed view */}
        <button
          type="button"
          className="tm-onb-banner"
          aria-expanded={!mobileCollapsed}
          aria-controls="tm-onb-stack"
          onClick={() => setMobileCollapsed(false)}
        >
          <span className="tm-onb-banner-lhs">
            <span className="tm-onb-banner-ring" style={ringStyle}>
              <span className="frac">{done}/3</span>
            </span>
            <span className="tm-onb-banner-text">
              <span className="tm-onb-banner-eyebrow">Onboarding · earn +500 XP</span>
              <span className="tm-onb-banner-title">
                {done} of 3 done — tap to continue
              </span>
            </span>
          </span>
          <span className="tm-onb-banner-arrow" aria-hidden>
            →
          </span>
        </button>

        <div className="tm-onb-head" id="tm-onb-head">
          <div className="tm-onb-head-lhs">
            <span>Get started</span>
            <span className="tm-onb-progress">{done}/3 done</span>
            <span className="tm-onb-grant">
              · Earn <strong>+{vm.xp_grant_amount ?? 500} XP</strong> on completion
            </span>
          </div>
          <button
            type="button"
            className="tm-onb-dismiss"
            aria-label="Dismiss onboarding cards"
            onClick={handleDismiss}
          >
            ×
          </button>
        </div>

        <div className="tm-onb-grid" id="tm-onb-stack">
          {CARDS.map((c) => (
            <Card
              key={c.key}
              copy={c}
              state={states[c.key]}
              vm={vm}
              savedJobId={savedJobId}
              onLockedTap={handleLockedTap}
              justUnlocked={c.key === "first_tailored_cv" && states[c.key] === "active" && Boolean(milestones.first_job_saved)}
            />
          ))}
        </div>
      </section>
      {longPressToast && <div className="tm-onb-mobile-toast" role="status" aria-live="polite">{longPressToast}</div>}
    </>
  )
}

interface CardProps {
  copy: CardCopy
  state: CardState
  vm: OnboardingStateResponse
  savedJobId: string | null
  onLockedTap: () => void
  justUnlocked: boolean
}

function Card({ copy, state, vm, savedJobId, onLockedTap, justUnlocked }: CardProps) {
  const cta = state === "done" ? "Re-open" : state === "locked" ? "Locked" : "Start"
  const href = copy.href(vm, savedJobId)

  const body = (
    <>
      {state === "locked" && (
        <>
          <span className="tm-onb-lock-icon" aria-hidden>🔒</span>
          <div className="tm-onb-tooltip" role="tooltip">Save a job first.</div>
        </>
      )}
      <div className="tm-onb-card-head">
        <span className="tm-onb-card-num" aria-hidden>
          {state === "done" ? "✓" : String(copy.idx).padStart(2, "0")}
        </span>
        <span className="tm-onb-card-eyebrow">{copy.eyebrow}</span>
      </div>
      <div className="tm-onb-card-title">{copy.title}</div>
      <div className="tm-onb-card-outcome">{copy.outcome}</div>
      <div className="tm-onb-card-foot">
        <span className="tm-onb-card-deeplink">{copy.deeplinkLabel}</span>
        <span className="tm-onb-card-cta">
          {cta}
          <span className="arrow" aria-hidden>→</span>
        </span>
      </div>
    </>
  )

  if (state === "locked") {
    return (
      <div
        className="tm-onb-card"
        data-state="locked"
        role="link"
        aria-disabled="true"
        tabIndex={-1}
        onClick={onLockedTap}
      >
        {body}
      </div>
    )
  }

  return (
    <Link
      href={href}
      className="tm-onb-card"
      data-state={state}
      data-just-unlocked={justUnlocked ? "true" : undefined}
      aria-label={`${copy.title} — ${copy.outcome}`}
    >
      {body}
    </Link>
  )
}

function SuccessCard({ firstName, amount }: { firstName: string; amount: number }) {
  return (
    <section
      className="tm-onb-success"
      role="region"
      aria-labelledby="tm-onb-success-title"
    >
      <div className="tm-onb-success-icon" aria-hidden>✓</div>
      <div className="tm-onb-success-body">
        <div className="tm-onb-success-eyebrow">Onboarding complete</div>
        <h3 className="tm-onb-success-title" id="tm-onb-success-title">
          Nice work, {firstName} — <span className="xp">+{amount} XP</span> banked.
        </h3>
        <div className="tm-onb-success-sub">
          You&apos;ve seen your map, picked a target, and tailored your first CV. From here, repeat the loop on a second role.
        </div>
      </div>
      <div className="tm-onb-success-actions">
        <Link className="primary" href="/skills">
          See your domain map <span className="ar" aria-hidden>→</span>
        </Link>
        <Link href="/tracker">
          Track applications <span className="ar" aria-hidden>→</span>
        </Link>
      </div>
    </section>
  )
}

function CompletionToast({ amount }: { amount: number }) {
  return (
    <div className="tm-onb-xp-toast" role="status" aria-live="polite">
      <span className="di" aria-hidden>◆</span> +{amount} XP · Onboarding complete
    </div>
  )
}
