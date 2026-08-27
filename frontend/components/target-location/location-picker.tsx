"use client"

/**
 * The one way a target location is chosen from the live job corpus.
 *
 * Settings already had this search: `jobs.analytics()` cities and countries,
 * typed into a listbox. Myro Search's Where slot took free text instead, so
 * typing a city produced Cancel/Add and no options. Onboarding offered chips
 * with no typeahead, so "Gurgaon" never found the "Gurugram" chip.
 *
 * One interface, `onChoose(name)`, for Myro Search. Settings keeps its
 * existing combobox chrome and onboarding keeps its chips; both call the
 * same matcher so "Gurgaon" finds "Gurugram" everywhere.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { jobs } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatCount } from "@/lib/format"
import {
  catalogFromAnalytics,
  suggestLocations,
} from "@/lib/location-catalog"

import "./location-picker.css"

export function LocationPicker({
  label,
  busy,
  chosen,
  extras,
  onChoose,
}: {
  label: string
  busy?: boolean
  chosen: string[]
  extras?: string[]
  onChoose: (location: string) => void
}) {
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const catalogQ = useQuery({
    queryKey: dataKeys.jobsAnalytics(),
    queryFn: () => jobs.analytics(),
    staleTime: 10 * 60 * 1000,
  })
  const catalog = useMemo(
    () => catalogFromAnalytics(catalogQ.data),
    [catalogQ.data],
  )
  const suggestions = useMemo(
    () => suggestLocations({ catalog, query, chosen, extras }),
    [catalog, query, chosen, extras],
  )

  useEffect(() => {
    if (!open) return
    function outside(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) close()
    }
    document.addEventListener("mousedown", outside)
    return () => document.removeEventListener("mousedown", outside)
  }, [open])

  function close() {
    setQuery("")
    setOpen(false)
  }

  function choose(location: string) {
    onChoose(location)
    close()
  }

  if (!open) {
    return (
      <button
        type="button"
        className="pf-slot-add tm-control-focus"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        {label}
      </button>
    )
  }

  return (
    <div ref={root} className="pf-slot-add pf-slot-add-open">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={label}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={label}
        className="tm-locpick-search tm-control-focus"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); close() }
          if (e.key === "Enter") {
            e.preventDefault()
            if (suggestions[0]) choose(suggestions[0].name)
          }
        }}
      />
      <div id={listId} role="listbox" aria-label="Location suggestions" className="tm-locpick-list">
        {catalogQ.isLoading ? (
          <Loader2 size={14} className="animate-spin" aria-label="Loading cities" />
        ) : null}
        {catalogQ.isError && !catalogQ.isLoading ? (
          <p className="tm-locpick-empty">Cities did not load.</p>
        ) : null}
        {!catalogQ.isLoading &&
          suggestions.map((entry) => (
            <button
              key={entry.name}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => choose(entry.name)}
              className="tm-locpick-option tm-control-focus"
            >
              <span className="tm-locpick-option-label">{entry.name}</span>
              {entry.count > 0 ? (
                <span className="tm-locpick-option-meta">{formatCount(entry.count)} open</span>
              ) : null}
            </button>
          ))}
        {!catalogQ.isLoading && query.trim().length >= 2 && suggestions.length === 0 ? (
          <p className="tm-locpick-empty">No live cities match that search.</p>
        ) : null}
      </div>
      <div className="pf-slot-add-actions">
        <button type="button" className="pf-plate-action" data-role="cancel" onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  )
}
