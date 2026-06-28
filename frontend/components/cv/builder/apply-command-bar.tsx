"use client"

import Link from "next/link"
import { getApplyCommandState } from "./apply-command-model"
import { Icon, type IconName } from "./icons"

interface ApplyCommandBarProps {
  variant?: "hero" | "dock"
  company: string
  jobTitle: string
  matchScore: number
  atsPassed: number
  atsTotal: number
  missingCount: number
  isDirty: boolean
  canSave: boolean
  isSaving: boolean
  isApplied: boolean
  applyOpened: boolean
  applyHref: string | null
  applyLabel: string
  isMarkingApplied: boolean
  markAppliedError: string | null
  onSaveAndPreview: () => void
  onPreviewDownload: () => void
  onOpenApply: () => void
  onMarkApplied: () => void
}

const STEP_LABELS = ["Save preview", "Download CV", "Apply", "Track"]

function metricText(matchScore: number, atsPassed: number, atsTotal: number, missingCount: number) {
  const gapText = missingCount === 0 ? "0 gaps" : `${missingCount} gap${missingCount === 1 ? "" : "s"}`
  return `${matchScore}% match · ATS ${atsPassed}/${atsTotal} · ${gapText}`
}

export function ApplyCommandBar({
  variant = "hero",
  company,
  jobTitle,
  matchScore,
  atsPassed,
  atsTotal,
  missingCount,
  isDirty,
  canSave,
  isSaving,
  isApplied,
  applyOpened,
  applyHref,
  applyLabel,
  isMarkingApplied,
  markAppliedError,
  onSaveAndPreview,
  onPreviewDownload,
  onOpenApply,
  onMarkApplied,
}: ApplyCommandBarProps) {
  const state = getApplyCommandState({ isDirty, isApplied, applyOpened })
  const isDock = variant === "dock"

  const primaryDisabled =
    state.phase === "draft"
      ? !canSave || isSaving
      : state.phase === "opened"
        ? isMarkingApplied
        : false

  const primaryIcon: IconName =
    state.phase === "draft"
      ? "save"
      : state.phase === "ready"
        ? "download"
        : state.phase === "opened"
          ? "check"
          : "tracker"

  const primaryLabel =
    state.phase === "draft" && isSaving
      ? "Saving..."
      : state.phase === "opened" && isMarkingApplied
        ? "Saving..."
        : state.primaryLabel

  const primaryButton = state.phase === "applied" ? (
    <Link href="/applications" className="cvb-btn sm primary cvb-apply-primary">
      <Icon name={primaryIcon} size={13} />
      {primaryLabel}
    </Link>
  ) : (
    <button
      type="button"
      className="cvb-btn sm primary cvb-apply-primary"
      onClick={
        state.phase === "draft"
          ? onSaveAndPreview
          : state.phase === "opened"
            ? onMarkApplied
            : onPreviewDownload
      }
      disabled={primaryDisabled}
    >
      <Icon name={primaryIcon} size={13} />
      {primaryLabel}
    </button>
  )

  return (
    <section className={`cvb-apply-command ${isDock ? "dock" : "hero"}`} aria-label="Application next step">
      <div className="cvb-apply-main">
        {!isDock && (
          <div className="cvb-apply-steps" aria-label="Application progress">
            {STEP_LABELS.map((label, index) => {
              const done = index < state.stepIndex || state.phase === "applied"
              const active = index === state.stepIndex && state.phase !== "applied"
              return (
                <span key={label} className={`cvb-apply-step${done ? " done" : ""}${active ? " active" : ""}`}>
                  <span className="cvb-apply-step-dot">
                    {done ? <Icon name="check" size={9} stroke={3} /> : index + 1}
                  </span>
                  {label}
                </span>
              )
            })}
          </div>
        )}
        <div className="cvb-apply-copy">
          <span className={`cvb-apply-status ${state.phase}`}>{state.status}</span>
          <span className="cvb-apply-title">{company} · {jobTitle}</span>
          <span className="cvb-apply-meta">{metricText(matchScore, atsPassed, atsTotal, missingCount)}</span>
        </div>
      </div>

      <div className="cvb-apply-actions">
        {state.phase === "opened" && (
          <button type="button" className="cvb-btn sm" onClick={onPreviewDownload}>
            <Icon name="download" size={13} />
            Preview &amp; download
          </button>
        )}
        {primaryButton}
        {!isDirty && !isApplied && applyHref && (
          <a
            href={applyHref}
            target="_blank"
            rel="noopener noreferrer"
            className="cvb-btn sm cvb-apply-open"
            onClick={onOpenApply}
          >
            <Icon name="external-link" size={13} />
            {applyLabel}
          </a>
        )}
      </div>

      {markAppliedError && <div className="cvb-apply-error">{markAppliedError}</div>}
    </section>
  )
}
