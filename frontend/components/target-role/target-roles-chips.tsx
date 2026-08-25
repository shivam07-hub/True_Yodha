"use client"

import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { type RoleFamily, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useEditTargetRole, useRoleReadiness } from "@/lib/hooks/use-edit-target-role"
import { RoleFamilyPicker } from "./role-family-picker"
import "./role-family-picker.css"

interface Props {
  /**
   * Optional explicit title list. Omit to self-source from the cached profile
   * query (same key as the shell — deduped, no extra fetch) so the control can
   * be mounted identically anywhere with zero prop-drilling.
   */
  roles?: string[]
  /** Show the corpus-backed role picker. Read-only display when false. */
  editable?: boolean
  /** Append per-role Readiness % to each chip (the "matching is active" signal). */
  showReadiness?: boolean
  onSaved?: (roles: string[]) => void
}

/* These chips are <span>s — they display your saved target roles, they are not
   controls. Under the Four-Signal rule non-interactive text carries NONE of the
   affordance signals, so the accent wash + accent border + accent text they wore
   until 2026-08-23 were three signals promising a tap that does not exist. The
   readiness % beside the label is a METRIC, so it reads as text at --tm-muted
   rather than as the accent (aligned accent-budget, DECISIONS.md ACC1). */
const CHIP: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 8px 5px 12px",
  borderRadius: "var(--tm-radius-pill)",
  background: "var(--tm-surface)",
  border: "1px solid var(--tm-border)",
  fontSize: 12,
  color: "var(--tm-text)",
  maxWidth: "100%",
}

/**
 * Canonical target-role control.
 *
 * The role picker is shared by Settings, the Jobs filter, and the score header.
 * Its choices come from the verified job corpus, so every chosen title is saved
 * with its role family and can drive the same matching and aspiration reads.
 */
export function TargetRolesChips({
  roles: rolesProp,
  editable = false,
  showReadiness = false,
  onSaved,
}: Props) {
  const { token } = useAuth()
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !rolesProp && !!token,
    staleTime: 10 * 60 * 1000,
  })
  const roles =
    rolesProp ??
    (profile?.target_role_titles?.length
      ? profile.target_role_titles
      : profile?.target_role_title
        ? [profile.target_role_title]
        : (profile?.target_roles ?? []))

  const edit = useEditTargetRole()
  const readinessQ = useRoleReadiness(showReadiness && roles.length > 0)

  const readinessFor = (role: string): number | null | undefined =>
    readinessQ.data?.find((r) => r.role.toLowerCase() === role.toLowerCase())?.readiness

  function chooseRole(role: RoleFamily) {
    edit.mutate(role, {
      onSuccess: () => onSaved?.([role.label]),
    })
  }

  const busy = edit.isPending

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
      {roles.map((role) => {
        const pct = showReadiness ? readinessFor(role) : undefined
        return (
          <span key={role} style={CHIP}>
            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {role}
            </span>
            {typeof pct === "number" && (
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--tm-text-muted)" }}>
                {pct}%
              </span>
            )}
          </span>
        )
      })}

      {readinessQ.isFetching && showReadiness && (
        <Loader2 size={13} className="animate-spin" aria-hidden style={{ color: "var(--tm-text-faint)" }} />
      )}

      {editable ? (
        <RoleFamilyPicker
          label={roles.length === 0 ? "Choose target role" : "Change target role"}
          busy={busy}
          onChoose={chooseRole}
        />
      ) : null}
    </div>
  )
}
