"use client"

import * as React from "react"
import Link from "next/link"
import { Icon } from "./icons"

export interface ChipJob {
  id: string
  label: string
  fit: number | null
}

export interface SelfChip {
  id: string
  label: string
  fit: number | null
}

interface MatchesRowsProps {
  myroFound: ChipJob[]
  selfFound: SelfChip[]
  activeId: string | null
  onPick: (id: string) => void
  onRemoveSelf: (id: string) => void
  addTargetHref?: string
  findMoreHref?: string
}

export function MatchesRows({
  myroFound,
  selfFound,
  activeId,
  onPick,
  onRemoveSelf,
  addTargetHref = "/jobs",
  findMoreHref = "/market",
}: MatchesRowsProps) {
  return (
    <div className="mc-match-section">
      <div className="mc-match-row">
        <div className="label">Myro Found</div>
        <div className="mc-chips">
          {myroFound.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>No matches yet</span>
          ) : (
            myroFound.map((j) => (
              <button
                key={j.id}
                type="button"
                className={`mc-chip${j.fit != null ? " has-fit" : ""}${j.id === activeId ? " active" : ""} tm-control-focus`}
                onClick={() => onPick(j.id)}
              >
                <span>{j.label}</span>
                {j.fit != null ? <span className="pct">· {j.fit}%</span> : null}
              </button>
            ))
          )}
          <Link className="mc-chip action tm-control-focus" href={addTargetHref}>
            <Icon name="plus" size={11} /> Add target
          </Link>
        </div>
      </div>

      <div className="mc-match-row">
        <div className="label">Liked Jobs</div>
        <div className="mc-chips">
          {selfFound.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>None yet</span>
          ) : (
            selfFound.map((j) => (
              <React.Fragment key={j.id}>
                <button
                  type="button"
                  className={`mc-chip${j.fit != null ? " has-fit" : ""}${j.id === activeId ? " active" : ""} tm-control-focus`}
                  onClick={() => onPick(j.id)}
                >
                  <span>{j.label}</span>
                  {j.fit != null ? <span className="pct">· {j.fit}%</span> : null}
                </button>
                <button
                  type="button"
                  className="mc-chip-close tm-control-focus"
                  aria-label={`Remove ${j.label}`}
                  onClick={() => onRemoveSelf(j.id)}
                >
                  <Icon name="x" size={8} />
                </button>
              </React.Fragment>
            ))
          )}
          <Link className="mc-chip action tm-control-focus" href={findMoreHref}>
            <Icon name="plus" size={11} /> Find more
          </Link>
        </div>
      </div>
    </div>
  )
}
