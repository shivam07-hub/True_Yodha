"use client"

import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { dataKeys } from "@/lib/domain-data"
import { onboarding, users } from "@/lib/api"

export function useOnboardingState(token: string | null) {
  const queryClient = useQueryClient()
  const state = useQuery({
    queryKey: dataKeys.onboarding(),
    queryFn: () => onboarding.state(token!),
    enabled: Boolean(token),
    staleTime: 2_000,
  })
  const profile = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: Boolean(token),
  })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: dataKeys.onboarding() })
    void queryClient.invalidateQueries({ queryKey: dataKeys.onboardingResult() })
    void queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
  }, [queryClient])

  return { state, profile, refresh }
}
