"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Search } from "lucide-react"

import { onboarding, type RoleFamily, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatCount } from "@/lib/format"
import { useAuth } from "@/lib/hooks/use-auth"
import { useEditTargetRole, useRoleReadiness } from "@/lib/hooks/use-edit-target-role"

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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const familiesQ = useQuery({
    queryKey: ["role-families", "target-role-picker", query],
    queryFn: () => onboarding.roleFamilies(token!, query.trim() || undefined),
    enabled: pickerOpen && !!token,
  })

  const readinessFor = (role: string): number | null | undefined =>
    readinessQ.data?.find((r) => r.role.toLowerCase() === role.toLowerCase())?.readiness

  function chooseRole(role: RoleFamily) {
    edit.mutate(role, {
      onSuccess: () => onSaved?.([role.label]),
    })
    setPickerOpen(false)
    setQuery("")
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

      {editable && (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            disabled={busy}
            aria-expanded={pickerOpen}
            aria-controls="target-role-options"
            style={ADD_BTN}
          >
            <Search size={13} strokeWidth={2.5} />
            {roles.length === 0 ? "Choose target role" : "Change target role"}
          </button>
          {pickerOpen && (
            <div
              id="target-role-options"
              role="listbox"
              aria-label="Target role options"
              style={{
                position: "absolute", zIndex: 50, top: "calc(100% + 6px)", left: 0,
                width: "min(360px, calc(100vw - 4rem))", padding: 8,
                background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)",
                borderRadius: "var(--tm-radius-sm)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <input
                autoFocus value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Search roles in live jobs" aria-label="Search target roles"
                role="combobox" aria-controls="target-role-options" aria-expanded
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: "var(--tm-radius-sm)",
                  background: "var(--tm-int-bg-hover)", border: "1px solid var(--tm-int-border)",
                  color: "var(--tm-text)", fontSize: 13, fontFamily: "inherit", outline: "none",
                }}
                onKeyDown={(event) => { if (event.key === "Escape") setPickerOpen(false) }}
              />
              <div style={{ maxHeight: 224, overflowY: "auto", marginTop: 6 }}>
                {familiesQ.isLoading && <Loader2 size={14} className="animate-spin" aria-label="Loading roles" />}
                {!familiesQ.isLoading && (familiesQ.data ?? []).map((role) => (
                  <button
                    key={role.family} type="button" role="option" aria-selected={false}
                    onClick={() => chooseRole(role)}
                    style={{ display: "block", width: "100%", padding: "9px 10px", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-interactive-rest)", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{role.label}</span>
                    <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "var(--tm-text-faint)" }}>{formatCount(role.open_count)} open · {role.matched_skill_count} matching skills</span>
                  </button>
                ))}
                {!familiesQ.isLoading && query.trim().length >= 2 && familiesQ.data?.length === 0 && (
                  <p style={{ margin: "8px 2px", fontSize: 12, color: "var(--tm-text-faint)" }}>No live role family matches that search.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
