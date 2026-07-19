"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"

import { scores, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/**
 * Score-map BFF gate. A successful bundled read warms the canonical child
 * caches before they mount; a failed bundle immediately falls back to the same
 * standalone endpoints. The bundle is transport only, never a second truth.
 */
export function useScoreMapData(token: string | null | undefined) {
  const queryClient = useQueryClient()
  const bootstrap = useQuery({
    queryKey: dataKeys.scoreMap(token),
    queryFn: async () => {
      const data = await scores.map(token!)
      queryClient.setQueryData(dataKeys.scores(), data.score)
      queryClient.setQueryData(dataKeys.userSkills(), data.skills)
      return data
    },
    enabled: !!token,
    staleTime: 60 * 1000,
    retry: false,
  })
  const settled = bootstrap.isSuccess || bootstrap.isError

  const score = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token && settled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const skills = useQuery({
    queryKey: dataKeys.userSkills(),
    queryFn: () => users.mySkills(token!),
    enabled: !!token && settled,
    staleTime: 5 * 60 * 1000,
  })
  return {
    score: score.data,
    skills: skills.data,
    isLoading: !settled || score.isLoading || skills.isLoading,
    isError: score.isError || skills.isError,
  }
}
