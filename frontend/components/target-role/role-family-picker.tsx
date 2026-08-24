"use client"

/**
 * The one way a target role is chosen.
 *
 * This search-and-choose interaction lived INSIDE `TargetRolesChips`, which is
 * the canonical control for Settings, the Jobs filter and the score header — so
 * three surfaces shared it and a fourth could not, without copying sixty lines
 * of listbox. Myro Search was that fourth surface, and it took roles as FREE
 * TEXT instead.
 *
 * That is not a cosmetic difference. A corpus choice carries its `family`, and
 * `target_roles` — the matcher's scoping key — is derived from families and
 * cannot be recovered from a typed title: `role_title_updates` deliberately
 * refuses to recreate the old substring-to-cluster table. So a role typed into
 * the pre-flight produced a title the user could see and a scoping key that
 * stayed stale. 34 users are in the far end of that state, searched against
 * "Java" and "Communication".
 *
 * One interface, `onChoose(RoleFamily)`, and the caller decides what a choice
 * MEANS — a profile write in Settings, a line on the Order in Myro Search.
 */

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Search } from "lucide-react"

import { onboarding, type RoleFamily } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { useAuth } from "@/lib/hooks/use-auth"

export function RoleFamilyPicker({
  label,
  busy,
  onChoose,
}: {
  /** The trigger's words. Callers differ: "Change target role", "a role you want". */
  label: string
  busy?: boolean
  onChoose: (role: RoleFamily) => void
}) {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const familiesQ = useQuery({
    queryKey: ["role-families", "picker", query],
    queryFn: () => onboarding.roleFamilies(token!, query.trim() || undefined),
    enabled: open && !!token,
  })

  function choose(role: RoleFamily) {
    onChoose(role)
    setOpen(false)
    setQuery("")
  }

  return (
    <div className="tm-rolepick">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        aria-controls="role-family-options"
        className="tm-rolepick-trigger tm-control-focus"
      >
        <Search size={13} strokeWidth={2.5} aria-hidden />
        {label}
      </button>

      {open ? (
        <div
          id="role-family-options"
          role="listbox"
          aria-label="Target role options"
          className="tm-rolepick-menu"
        >
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search roles in live jobs"
            aria-label="Search target roles"
            role="combobox"
            aria-controls="role-family-options"
            aria-expanded
            className="tm-rolepick-search"
            onKeyDown={(event) => { if (event.key === "Escape") setOpen(false) }}
          />
          <div className="tm-rolepick-list">
            {familiesQ.isLoading ? (
              <Loader2 size={14} className="animate-spin" aria-label="Loading roles" />
            ) : null}
            {!familiesQ.isLoading &&
              (familiesQ.data ?? []).map((role) => (
                <button
                  key={role.family}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => choose(role)}
                  className="tm-rolepick-option tm-control-focus"
                >
                  <span className="tm-rolepick-option-label">{role.label}</span>
                  {/* The evidence for the choice: this is why it is corpus-backed
                      and not a free-text box wearing a dropdown. */}
                  <span className="tm-rolepick-option-meta">
                    {formatCount(role.open_count)} open · {role.matched_skill_count} matching skills
                  </span>
                </button>
              ))}
            {!familiesQ.isLoading && query.trim().length >= 2 && familiesQ.data?.length === 0 ? (
              <p className="tm-rolepick-empty">No live role family matches that search.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
