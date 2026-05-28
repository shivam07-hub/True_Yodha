"use client"

import { useEffect, useRef, useState } from "react"
import { QUICK_FILTERS, SEARCH_SUGGESTIONS, fmtNum } from "./intel-data"

interface Props {
  value: string
  onChange: (v: string) => void
  jobsTotal: number
  jobsShown: number
  activeChips: string[]
  onToggleChip: (id: string) => void
}

export function IntelCommandBar({
  value, onChange, jobsTotal, jobsShown, activeChips, onToggleChip,
}: Props) {
  const [focused, setFocused] = useState(false)
  const [suggest, setSuggest] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focused || value) return
    const id = setInterval(() => {
      setSuggest((s) => (s + 1) % SEARCH_SUGGESTIONS.length)
    }, 3500)
    return () => clearInterval(id)
  }, [focused, value])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="tm-intel-cmd-wrap">
      <div className={"tm-intel-cmd" + (focused ? " is-focused" : "")}>
        <svg
          className="tm-intel-cmd-icon"
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`search ${fmtNum(jobsTotal)} jobs — try ${SEARCH_SUGGESTIONS[suggest]}`}
        />
        <span className="tm-intel-cmd-count">
          {value || activeChips.length ? (
            <><b>{fmtNum(jobsShown)}</b> matches</>
          ) : (
            <>{fmtNum(jobsTotal)} indexed</>
          )}
        </span>
        <span className="tm-intel-kbd">⌘K</span>
      </div>

      <div className="tm-intel-chips">
        <span className="tm-intel-chips-label">Quick filters</span>
        {QUICK_FILTERS.map((qf) => {
          const isActive = activeChips.includes(qf.id)
          return (
            <button
              key={qf.id}
              type="button"
              className={"tm-intel-chip" + (isActive ? " is-active" : "")}
              onClick={() => onToggleChip(qf.id)}
              aria-pressed={isActive}
            >
              {qf.label}
              {isActive ? <span className="tm-intel-chip-x">×</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
