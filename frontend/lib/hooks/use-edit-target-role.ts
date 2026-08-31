import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { onboarding, type RoleFamily, type RoleStanding } from "@/lib/api"
import { dataKeys, invalidateTargetRoleData } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

/**
 * Canonical "edit target role" mutation (issue #145, decision A).
 *
 * Every point-of-use role edit — score header, jobs filter, settings — routes
 * through the recompute-wired `PUT /onboarding/target` (save_target), NOT the
 * loose update_profile that wrote role fields without re-scoring. The corpus
 * selection supplies its human title and verified family together; the server
 * preserves the user's existing seniority/location.
 * On success every role-dependent read (score, skills, job feed) is refreshed.
 */
export function useEditTargetRole() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (role: Pick<RoleFamily, "family" | "label">) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return onboarding.saveTarget(token, {
        role_title: role.label.trim(),
        role_family: role.family,
      })
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

/**
 * Where the user stands on the core skills of their target roles — ONE count for
 * the whole target, not one per chip.
 *
 * The three titles a user types ("tech sales", "IT Sales", "Technical Account
 * Manager") resolve to a shared set of families and one shared core, so a count
 * per chip would show three denominators over overlapping skills and make the
 * user reconcile arithmetic we invented. The number it replaced was worse still:
 * one value computed from the union of families and then returned once per
 * title, so all three chips always read the same percentage.
 */
export function useRoleStanding(enabled = true) {
  const { token } = useAuth()
  return useQuery<RoleStanding>({
    queryKey: dataKeys.roleStanding(),
    queryFn: () => onboarding.roleStanding(token!),
    enabled: enabled && !!token,
    staleTime: 5 * 60 * 1000,
  })
}
