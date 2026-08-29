"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api-error"
import type { CompanySkillIntelligence } from "@/lib/api"
import { skillDemandView, type SkillDemandView } from "@/lib/company-skill-demand"
import { publicRead } from "@/lib/public-api"
import { CompanySkillIntelligenceCard } from "./company-skill-intelligence"

function SkillDemandStatus({
  view,
  companyName,
  onRetry,
}: {
  view: SkillDemandView
  companyName: string
  onRetry: () => void
}) {
  if (view.kind === "loading") {
    return (
      <div role="status" className="mb-8 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 text-sm text-[var(--tm-text-faint)]">
        Loading skill demand…
      </div>
    )
  }

  if (view.kind === "ready") {
    return <CompanySkillIntelligenceCard companyName={companyName} data={view.data} />
  }

  if (view.kind === "error") {
    return (
      <div role="alert" className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 text-sm text-[var(--tm-text-faint)]">
        <span>Skill demand could not be loaded.</span>
        <Button type="button" variant="solid" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="mb-8 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 text-sm text-[var(--tm-text-faint)]">
      No skill-demand snapshot is available yet.
    </div>
  )
}

export function CompanySkillDemandPanel({ companyName }: { companyName: string }) {
  const [showSkillIntelligence, setShowSkillIntelligence] = useState(false)
  const {
    data: skillIntelligence,
    isFetching: isFetchingSkillIntelligence,
    isError: isSkillIntelligenceError,
    refetch: refetchSkillIntelligence,
  } = useQuery({
    queryKey: ["company-skill-intelligence", companyName],
    queryFn: () =>
      publicRead<CompanySkillIntelligence>(
        `/companies/${encodeURIComponent(companyName)}/skill-intelligence?limit=20`,
        { missing: "empty" },
      ),
    enabled: showSkillIntelligence,
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => {
      if (error instanceof ApiError && !error.retryable) return false
      return count < 2
    },
    retryDelay: count => Math.min(1000 * 2 ** count, 4000),
  })

  if (!showSkillIntelligence) {
    return (
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 sm:p-6">
        <div>
          <h2 className="text-balance text-sm font-semibold text-[var(--tm-text)]">
            What skills is {companyName} hiring for?
          </h2>
          <p className="mt-1 text-pretty text-xs text-[var(--tm-text-faint)]">
            Open the latest skill-demand snapshot when you need it.
          </p>
        </div>
        <Button type="button" variant="neutral" size="sm" onClick={() => setShowSkillIntelligence(true)}>
          Show skill demand
        </Button>
      </div>
    )
  }

  const view = skillDemandView({
    fetching: isFetchingSkillIntelligence,
    error: isSkillIntelligenceError,
    data: skillIntelligence,
  })

  return (
    <SkillDemandStatus
      view={view}
      companyName={companyName}
      onRetry={() => void refetchSkillIntelligence()}
    />
  )
}
