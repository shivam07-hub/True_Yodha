"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

import { LevelAsk } from "@/components/career-path/level-ask"
import { skeletonForPath } from "@/components/loading/page-skeletons"
import { TargetConfirm } from "@/components/onboarding/target-confirm"
import { invalidateTargetRoleData } from "@/lib/domain-data"
import { targetAsk } from "@/lib/career-skill-path"
import { useCareerSkillPath } from "@/lib/hooks/use-career-skill-path"
import { useAuth } from "@/lib/hooks/use-auth"
import type { OnboardingResult } from "@/lib/api"

function isAwaitingTarget(
  value: OnboardingResult | null | undefined,
): value is Extract<OnboardingResult, { kind: "awaiting_target" }> {
  return value?.kind === "awaiting_target"
}

/**
 * Gates score, skill path, and personalized matches behind a canonical
 * CareerTargetSnapshot. CV, settings, and saved work stay readable outside this
 * wrapper. Users without a CV (no target_flow) keep browsing.
 *
 * A direction is a role and a level: a role with no level is asked the level
 * alone (`LevelAsk`), never sent back through the whole journey.
 */
export function RequiresCareerTarget({ children }: { children: ReactNode }) {
  const { token, ready } = useAuth()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const path = useCareerSkillPath()

  // Same picker as loading.tsx / the app shell. Hardcoding PracticeSkeleton here
  // painted the score-map ring on /market while the career-path query resolved.
  if (!ready || !token || path.isLoading) return <>{skeletonForPath(pathname)}</>
  const ask = targetAsk(path.data)
  if (ask && isAwaitingTarget(path.data?.target_flow)) {
    if (ask === "level") {
      return (
        <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)" }}>
          <LevelAsk token={token} result={path.data.target_flow} />
        </div>
      )
    }
    return (
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)" }}>
        <TargetConfirm
          token={token}
          result={path.data.target_flow}
          onConfirmed={() => {
            invalidateTargetRoleData(queryClient)
          }}
        />
      </div>
    )
  }
  return <>{children}</>
}
