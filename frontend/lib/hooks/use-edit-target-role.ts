import { useMutation, useQueryClient } from "@tanstack/react-query"

import { onboarding } from "@/lib/api"
import { invalidateTargetRoleData } from "@/lib/domain-data"
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
