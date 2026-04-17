"use client"

import { useEffect, useRef, useState } from "react"
import { Building2, ChevronDown, Factory, Search, SlidersHorizontal, X } from "lucide-react"

interface FilterBarProps {
  activeRoles: number
  totalRoles: number
  companies: string[]
  industries: string[]
  selectedCompanies: Set<string>
  selectedIndustries: Set<string>
  onToggleCompany: (name: string) => void
  onToggleIndustry: (name: string) => void
  onClear: () => void
}

type Panel = "companies" | "industries" | null

function useClickOutside(ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [ref, onClose])
}

interface DropdownProps {
  items: string[]
  selected: Set<string>
  onToggle: (item: string) => void
  icon: React.ReactNode
  placeholder: string
}

function Dropdown({ items, selected, onToggle, icon, placeholder }: DropdownProps) {
  const [search, setSearch] = useState("")
  const filtered = items.filter((i) => i.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col" style={{ maxHeight: 320 }}>
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 border-b border-border px-3 py-1.5">
        <button
          onClick={() => items.forEach(onToggle)}
          className="text-[10px] text-primary hover:underline"
        >
          Select all
        </button>
        <button
          onClick={() => Array.from(selected).forEach(onToggle)}
          className="text-[10px] text-muted-foreground hover:underline"
        >
          Clear
        </button>
      </div>

      {/* List */}
      <ul className="overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-xs text-muted-foreground">No results</li>
        ) : (
          filtered.map((item) => (
            <li key={item}>
              <button
                onClick={() => onToggle(item)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-muted/60 transition-colors"
              >
                <span className={[
                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                  selected.has(item) ? "border-primary bg-primary" : "border-muted-foreground/40",
                ].join(" ")}>
                  {selected.has(item) && (
                    <svg viewBox="0 0 8 8" className="h-2 w-2 text-primary-foreground" fill="currentColor">
                      <path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                    </svg>
                  )}
                </span>
                <span className="flex items-center gap-1.5 min-w-0">
                  {icon}
                  <span className="truncate">{item}</span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

interface PillProps {
  label: string
  count?: number
  active: boolean
  open: boolean
  onClick: () => void
  onClear?: () => void
}

function FilterPill({ label, count, active, open, onClick, onClear }: PillProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-primary bg-primary/10 text-primary"
          : open
          ? "border-primary/40 bg-muted text-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
      ].join(" ")}
    >
      <span>{label}</span>
      {active && count != null && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground leading-none">
          {count}
        </span>
      )}
      {active && onClear ? (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onClear() }}
          className="ml-0.5 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </span>
      ) : (
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      )}
    </button>
  )
}

export function FilterBar({
  activeRoles,
  totalRoles,
  companies,
  industries,
  selectedCompanies,
  selectedIndustries,
  onToggleCompany,
  onToggleIndustry,
  onClear,
}: FilterBarProps) {
  const [openPanel, setOpenPanel] = useState<Panel>(null)
  const containerRef = useRef<HTMLDivElement>(null!)
  useClickOutside(containerRef, () => setOpenPanel(null))

  const isFiltered = selectedCompanies.size > 0 || selectedIndustries.size > 0

  function toggle(panel: Panel) {
    setOpenPanel((prev) => (prev === panel ? null : panel))
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Pill row */}
      <div className="flex items-center gap-2 flex-wrap">
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        {/* Active Roles — informational, not a filter trigger */}
        <div className={[
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
          isFiltered ? "border-primary/30 bg-primary/5 text-primary" : "border-border text-muted-foreground",
        ].join(" ")}>
          <span>Active Roles</span>
          <span className="font-bold tabular-nums">{activeRoles.toLocaleString()}</span>
          {isFiltered && totalRoles !== activeRoles && (
            <span className="text-[10px] opacity-60">/ {totalRoles.toLocaleString()}</span>
          )}
        </div>

        {/* Companies filter */}
        <FilterPill
          label="Companies"
          count={selectedCompanies.size}
          active={selectedCompanies.size > 0}
          open={openPanel === "companies"}
          onClick={() => toggle("companies")}
          onClear={selectedCompanies.size > 0 ? () => Array.from(selectedCompanies).forEach(onToggleCompany) : undefined}
        />

        {/* Industries filter */}
        <FilterPill
          label="Industries"
          count={selectedIndustries.size}
          active={selectedIndustries.size > 0}
          open={openPanel === "industries"}
          onClick={() => toggle("industries")}
          onClear={selectedIndustries.size > 0 ? () => Array.from(selectedIndustries).forEach(onToggleIndustry) : undefined}
        />

        {/* Clear all */}
        {isFiltered && (
          <button
            onClick={onClear}
            className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Dropdown panel */}
      {openPanel !== null && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          {openPanel === "companies" && (
            <Dropdown
              items={companies}
              selected={selectedCompanies}
              onToggle={onToggleCompany}
              icon={<Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />}
              placeholder="Search companies…"
            />
          )}
          {openPanel === "industries" && (
            <Dropdown
              items={industries}
              selected={selectedIndustries}
              onToggle={onToggleIndustry}
              icon={<Factory className="h-3 w-3 shrink-0 text-muted-foreground" />}
              placeholder="Search industries…"
            />
          )}
        </div>
      )}
    </div>
  )
}
