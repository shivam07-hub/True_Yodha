import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { careerSkillPath } from "@/lib/career-skill-path"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

export function useCareerSkillPath() {
  const { token, ready } = useAuth()
  return useQuery({
    queryKey: dataKeys.careerSkillPath(),
    queryFn: () => careerSkillPath.get(token!),
    enabled: !!ready && !!token,
    staleTime: 60 * 1000,
  })
}

export function useLearningPathRequest() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taxonomyKey: string) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return careerSkillPath.request(token, taxonomyKey)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dataKeys.careerSkillPath() })
    },
  })
}

export function useLearningPathWithdraw() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taxonomyKey: string) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return careerSkillPath.withdraw(token, taxonomyKey)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dataKeys.careerSkillPath() })
    },
  })
}
