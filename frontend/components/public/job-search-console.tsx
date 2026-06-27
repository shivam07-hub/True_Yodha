"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { getJobSearchExamples, normalizeJobSearchQuery } from "./job-search-console-model"
import "./job-search-console.css"

export interface JobSearchChip {
  id: string
  label: string
}

interface JobSearchConsoleProps {
  value: string
  onValueChange: (value: string) => void
  onSubmit: (value: string) => void
  ariaLabel: string
  placeholder?: string
  submitLabel?: string
  examples?: string[]
  chips?: JobSearchChip[]
  activeChipIds?: string[]
  chipLabel?: string
  onToggleChip?: (id: string) => void
  loading?: boolean
  enableShortcut?: boolean
  className?: string
  variant?: "landing" | "intel"
}

export function JobSearchConsole({
  value,
  onValueChange,
  onSubmit,
  ariaLabel,
  placeholder = "e.g. product roles in Bangalore, under 3 yrs",
  submitLabel = "Find roles",
  examples = getJobSearchExamples(),
  chips,
  activeChipIds = [],
  chipLabel = "Quick filters",
  onToggleChip,
  loading = false,
  enableShortcut = false,
  className = "",
  variant = "landing",
}: JobSearchConsoleProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!enableShortcut) return
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enableShortcut])

  function submit(rawValue: string) {
    const query = normalizeJobSearchQuery(rawValue)
    if (!query || loading) return
    onSubmit(query)
  }

  const rootClass = [
    "tm-job-search-console",
    `tm-job-search-console--${variant}`,
    className,
  ].filter(Boolean).join(" ")

  return (
    <div className={rootClass}>
      <form
        className={"tm-job-search-form" + (focused ? " is-focused" : "")}
        onSubmit={(event) => {
          event.preventDefault()
          submit(value)
        }}
      >
        <Search size={20} strokeWidth={1.8} aria-hidden className="tm-job-search-icon" />
        <input
          ref={inputRef}
          className="tm-job-search-input"
          type="text"
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          maxLength={200}
        />
        <button
          className="tm-job-search-submit"
          type="submit"
          disabled={loading || normalizeJobSearchQuery(value).length < 2}
        >
          {loading ? <Loader2 size={16} className="tm-job-search-spin" aria-hidden /> : submitLabel}
        </button>
      </form>

      {chips && chips.length > 0 ? (
        <div className="tm-job-search-options">
          <span className="tm-job-search-options-label">{chipLabel}</span>
          {chips.map((chip) => {
            const active = activeChipIds.includes(chip.id)
            return (
              <button
                key={chip.id}
                type="button"
                className={"tm-job-search-chip" + (active ? " is-active" : "")}
                onClick={() => onToggleChip?.(chip.id)}
                aria-pressed={active}
              >
                {chip.label}
                {active ? <span className="tm-job-search-chip-x">×</span> : null}
              </button>
            )
          })}
        </div>
      ) : examples.length > 0 ? (
        <div className="tm-job-search-options">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              className="tm-job-search-chip"
              onClick={() => {
                onValueChange(example)
                submit(example)
              }}
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
