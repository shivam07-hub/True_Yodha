"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Plus, X } from "lucide-react"

import { users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useEditTargetRoles, useRoleReadiness } from "@/lib/hooks/use-edit-target-role"

interface Props {
  /**
   * Optional explicit title list. Omit to self-source from the cached profile
   * query (same key as the shell — deduped, no extra fetch) so the control can
   * be mounted identically anywhere with zero prop-drilling.
   */
  roles?: string[]
  /** Show the add-a-role input + per-chip remove. Read-only display when false. */
  editable?: boolean
  /** Append per-role Readiness % to each chip (the "matching is active" signal). */
  showReadiness?: boolean
  /** Cap on targeted roles (server enforces 5). */
  max?: number
  onSaved?: (roles: string[]) => void
}

const MAX_ROLES = 5
const MIN_LEN = 2

const CHIP: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 8px 5px 12px",
  borderRadius: "var(--tm-radius-pill)",
  background: "var(--tm-int-bg-wash)",
  border: "1px solid var(--tm-int-border)",
  fontSize: 12,
  color: "var(--tm-interactive)",
  maxWidth: "100%",
}

const REMOVE_BTN: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--tm-int-border-soft)",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--tm-interactive)",
}

const ADD_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 12px",
  borderRadius: "var(--tm-radius-pill)",
  background: "transparent",
  border: "1px dashed var(--tm-border-soft)",
  fontSize: 12,
  color: "var(--tm-text-muted)",
  cursor: "pointer",
}

/**
 * Canonical multi-role target control (User Memory Phase 0).
 *
 * The user targets up to 5 human role titles, rendered as selected chips in the
 * SAME visual language as Target Companies / Locations — one control across the
 * jobs filter, Settings, and the score header, so "my roles" reads consistently
 * everywhere. That the chips render selected IS the confirmation that matching
 * is active (design-over-words). Writing the whole list routes through the
 * recompute-wired save_target; the server derives the matcher clusters.
 */
export function TargetRolesChips({
  roles: rolesProp,
  editable = false,
  showReadiness = false,
  max = MAX_ROLES,
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

  const edit = useEditTargetRoles()
  const readinessQ = useRoleReadiness(showReadiness && roles.length > 0)
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState("")

  const readinessFor = (role: string): number | null | undefined =>
    readinessQ.data?.find((r) => r.role.toLowerCase() === role.toLowerCase())?.readiness

  function commit(next: string[]) {
    edit.mutate(next, { onSuccess: () => onSaved?.(next) })
  }

  function addRole() {
    const t = value.trim()
    const dupe = roles.some((r) => r.toLowerCase() === t.toLowerCase())
    if (t.length < MIN_LEN || dupe || roles.length >= max) {
      setValue("")
      setAdding(false)
      return
    }
    commit([...roles, t])
    setValue("")
    setAdding(false)
  }

  function removeRole(index: number) {
    if (roles.length <= 1) return // the score + matcher always need one role
    commit(roles.filter((_, i) => i !== index))
  }

  const atCap = roles.length >= max
  const busy = edit.isPending

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
      {roles.map((role, i) => {
        const pct = showReadiness ? readinessFor(role) : undefined
        const canRemove = editable && roles.length > 1
        return (
          <span key={role} style={CHIP}>
            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {role}
            </span>
            {typeof pct === "number" && (
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>
                {pct}%
              </span>
            )}
            {canRemove && (
              <button
                type="button"
                onClick={() => removeRole(i)}
                disabled={busy}
                aria-label={`Remove ${role}`}
                title={`Remove ${role}`}
                style={REMOVE_BTN}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            )}
          </span>
        )
      })}

      {readinessQ.isFetching && showReadiness && (
        <Loader2 size={13} className="animate-spin" aria-hidden style={{ color: "var(--tm-text-faint)" }} />
      )}

      {editable && !atCap && (
        adding ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={addRole}
            onKeyDown={(e) => {
              if (e.key === "Enter") addRole()
              if (e.key === "Escape") {
                setValue("")
                setAdding(false)
              }
            }}
            placeholder="e.g. Product Manager"
            aria-label="Add a target role"
            disabled={busy}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--tm-radius-pill)",
              background: "var(--tm-int-bg-hover)",
              border: "1px solid var(--tm-int-border)",
              color: "var(--tm-text)",
              fontSize: 12,
              fontFamily: "inherit",
              outline: "none",
              minWidth: 140,
            }}
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} disabled={busy} style={ADD_BTN}>
            <Plus size={13} strokeWidth={2.5} />
            {roles.length === 0 ? "Set target role" : "Add role"}
          </button>
        )
      )}
    </div>
  )
}
