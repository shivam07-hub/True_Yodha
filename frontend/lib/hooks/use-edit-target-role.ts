import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { onboarding, type RoleReadiness } from "@/lib/api"
import { dataKeys, invalidateTargetRoleData } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

/**
 * Canonical "edit target role" mutation (issue #145, decision A).
 *
 * Every point-of-use role edit — score header, jobs filter, settings — routes
 * through the recompute-wired `PUT /onboarding/target` (save_target), NOT the
 * loose update_profile that wrote role fields without re-scoring. Passing only
 * `role_title` preserves the user's existing seniority/location server-side.
 * On success every role-dependent read (score, skills, job feed) is refreshed.
 */
export function useEditTargetRole() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (roleTitle: string) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return onboarding.saveTarget(token, { role_title: roleTitle.trim() })
    },
    onSuccess: () => invalidateTargetRoleData(queryClient),
  })
}

/**
 * Multi-role variant — writes the WHOLE ordered title list (chips). The backend
 * derives the union of taxonomy clusters into `target_roles` (matcher read model)
 * and keeps `target_role_titles[0]` as the primary. Same recompute-wired path.
 */
export function useEditTargetRoles() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (roleTitles: string[]) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return onboarding.saveTarget(token, {
        role_titles: roleTitles.map((r) => r.trim()).filter(Boolean),
      })
    },
    onSuccess: () => invalidateTargetRoleData(queryClient),
  })
}

/** Per-target-role readiness % — the role-specific signal beside the Myro Score. */
export function useRoleReadiness(enabled = true) {
  const { token } = useAuth()
  return useQuery<RoleReadiness[]>({
    queryKey: dataKeys.roleReadiness(),
    queryFn: () => onboarding.roleReadiness(token!),
    enabled: enabled && !!token,
    staleTime: 5 * 60 * 1000,
  })
}
