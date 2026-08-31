"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { type RoleFamily, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useEditTargetRole, useRoleStanding } from "@/lib/hooks/use-edit-target-role"
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
  /** Show where the user stands on their target's core skills — ONE count for
   *  the whole target, rendered after the chips, never per chip. */
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
/* The standing sits BESIDE the chips, once — not appended to each. Three typed
   titles resolve to one shared core, so a per-chip count would show three
   denominators over overlapping skills the user would have to reconcile.
   
   It is a DOOR, not a readout: a count with no list is a number you cannot act
   on, so it opens the twelve it is counting. That makes it interactive, so it
   carries the affordance — `.tm-link` supplies the colour, hover and focus ring
   rather than this file re-rolling them. The number itself stays --tm-text: it
   is the metric, and only the label needs to look like the link. */
const STANDING: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
  fontFamily: "var(--tm-font-mono)",
  textDecoration: "none",
}

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
  const standingQ = useRoleStanding(showReadiness && roles.length > 0)
  const standing = standingQ.data

  function chooseRole(role: RoleFamily) {
    edit.mutate(role, {
      onSuccess: () => onSaved?.([role.label]),
    })
  }

  const busy = edit.isPending

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
      {roles.map((role) => (
        <span key={role} style={CHIP}>
          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {role}
          </span>
        </span>
      ))}

      {/* Nothing when the market has no opinion — "0 / 12" against a market we
          never asked about reads as a verdict on the user. */}
      {showReadiness && standing && standing.total > 0 && (
        <Link
          href="/practice"
          className="tm-link"
          style={STANDING}
          title={`You clear the bar on ${standing.cleared} of the ${standing.total} skills your target roles ask for most`}
        >
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--tm-text)" }}>
            {standing.cleared} / {standing.total}
          </span>
          <span>core skills</span>
        </Link>
      )}

      {standingQ.isFetching && showReadiness && (
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
