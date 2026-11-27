"use client"

import { useId, useMemo, useState, type KeyboardEvent } from "react"
import { Search } from "lucide-react"
import { formatCount } from "@/lib/format"
import { matchRoles, roleLabel } from "./role-match"

interface RoleSearchProps {
  /** Every family the landing offers, busiest first: the chips, then the rest. */
  pool: readonly { family: string; jobs: number }[]
  onChoose: (family: string) => void
}

/**
 * Spec #66 L2b: the roles past the eight chips. The snapshot lists every
 * qualifying family by name and open count, so the list filters as the visitor
 * types with no request. A combobox: the input keeps focus, arrows move through
 * the options, Enter takes the highlighted one.
 */
export function RoleSearch({ pool, onChoose }: RoleSearchProps) {
  const listId = `${useId()}-roles`
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => matchRoles(query, pool), [query, pool])
  const showing = open && query.trim().length >= 2
  const highlighted = showing ? matches[active] : undefined

  function choose(family: string) {
    onChoose(family)
    setQuery("")
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false)
      return
    }
    if (matches.length === 0) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setOpen(true)
      setActive((i) => (i + step + matches.length) % matches.length)
    } else if (event.key === "Enter" && highlighted) {
      event.preventDefault()
      choose(highlighted.family)
    }
  }

  return (
    <div className="lp-role-search">
      <Search className="lp-role-search-icon" aria-hidden="true" />
      <input
        className="lp-role-search-input"
        type="text"
        role="combobox"
        aria-label="Search other roles"
        aria-autocomplete="list"
        aria-expanded={showing && matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={highlighted ? `${listId}-${active}` : undefined}
        placeholder="Other role"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showing && matches.length > 0 ? (
        <ul id={listId} role="listbox" aria-label="Roles" className="lp-role-options">
          {matches.map((role, i) => (
            <li
              key={role.family}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="lp-role-option"
              title={role.family}
              // The input keeps focus, so a press must not blur it first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(role.family)}
            >
              <span className="lp-role-option-name">{roleLabel(role.family)}</span>
              <span className="lp-role-option-count">{formatCount(role.jobs)} jobs</span>
            </li>
          ))}
        </ul>
      ) : null}
      {showing && matches.length === 0 ? (
        <p className="lp-role-options lp-role-none" role="status">
          No match
        </p>
      ) : null}
    </div>
  )
}
