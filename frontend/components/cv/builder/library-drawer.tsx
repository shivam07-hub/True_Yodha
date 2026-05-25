/**
 * Finder-style CV draft drawer for the /cv library.
 * It projects immutable CV versions as familiar files and previews.
 */
"use client"

import { useState } from "react"
import type { CVVersion } from "@/lib/api"
import { formatGlobalVersionLabel, timeAgo } from "@/lib/cv/version-format"
import { Icon } from "./icons"

export interface CVLibraryRow {
  v: CVVersion
  thread: string
}

type LibraryMode = "files" | "previews"

interface CVLibraryDrawerProps {
  rows: CVLibraryRow[]
  currentBaselineId: number | null
  selectedVId: number | null
  onSelect: (id: number) => void
}

export function formatLibraryDocumentTitle(version: CVVersion): string {
  if (version.kind === "baseline_upload") return "Master CV"
  const company = version.company_name?.trim()
  const role = version.job_title?.trim()
  if (company && role) return `${company} · ${role}`
  if (company) return `${company} tailored CV`
  if (role) return role
  return "Tailored CV"
}

export function formatLibraryDocumentKind(version: CVVersion): string {
  if (version.kind === "baseline_upload") return "Main CV"
  if (version.kind === "polished") return "AI polished"
  if (version.kind === "edited") return "Edited copy"
  return "Tailored CV"
}

function kindTone(version: CVVersion): string {
  if (version.kind === "baseline_upload") return "main"
  if (version.kind === "polished") return "polished"
  if (version.kind === "edited") return "edited"
  return "tailored"
}

function documentMeta(version: CVVersion): string {
  return `${formatGlobalVersionLabel(version)} · ${formatLibraryDocumentKind(version)}`
}

export function CVLibraryDrawer({ rows, currentBaselineId, selectedVId, onSelect }: CVLibraryDrawerProps) {
  const [mode, setMode] = useState<LibraryMode>("files")

  return (
    <div id="cv-library" className="cvb-graph-col cvb-library-drawer">
      <div className="cvb-section-head cvb-library-head">
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Icon name="folder" size={14} style={{ color: "var(--tm-accent)" }}/>
          <span className="eyebrow">CV Drafts</span>
        </div>
        <div className="cvb-library-head-actions">
          <span className="mono cvb-library-count">
            {rows.length} {rows.length === 1 ? "draft" : "drafts"}
          </span>
          <div className="cvb-library-toggle" role="group" aria-label="CV draft view">
            <button
              type="button"
              className={mode === "files" ? "active" : ""}
              aria-pressed={mode === "files"}
              onClick={() => setMode("files")}
            >
              <Icon name="file" size={12}/>
              <span>Files</span>
            </button>
            <button
              type="button"
              className={mode === "previews" ? "active" : ""}
              aria-pressed={mode === "previews"}
              onClick={() => setMode("previews")}
            >
              <Icon name="eye" size={12}/>
              <span>Previews</span>
            </button>
          </div>
        </div>
      </div>

      <div className="cvb-graph-scroll">
        {rows.length === 0 ? (
          <div className="cvb-library-empty">No CVs yet. Upload your Main CV to begin.</div>
        ) : mode === "files" ? (
          <CVLibraryFileList
            rows={rows}
            currentBaselineId={currentBaselineId}
            selectedVId={selectedVId}
            onSelect={onSelect}
          />
        ) : (
          <CVLibraryPreviewGrid
            rows={rows}
            currentBaselineId={currentBaselineId}
            selectedVId={selectedVId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  )
}

function CVLibraryFileList({ rows, currentBaselineId, selectedVId, onSelect }: CVLibraryDrawerProps) {
  return (
    <>
      {rows.map(({ v, thread }, i) => {
        const prev = rows[i - 1]
        const isFirstOfThread = !prev || prev.thread !== thread
        const header = isFirstOfThread && v.kind !== "baseline_upload" ? (
          <div key={`head-${thread}`} className="cvb-library-folder-head">
            <Icon name="folder" size={12}/>
            <span>{v.company_name ?? "Tailored CVs"}</span>
          </div>
        ) : null
        return (
          <div key={v.id}>
            {header}
            <CVLibraryFileRow
              version={v}
              current={currentBaselineId === v.id}
              selected={selectedVId === v.id}
              onSelect={onSelect}
            />
          </div>
        )
      })}
    </>
  )
}

function CVLibraryPreviewGrid({ rows, currentBaselineId, selectedVId, onSelect }: CVLibraryDrawerProps) {
  return (
    <div className="cvb-library-preview-grid">
      {rows.map(({ v }) => (
        <CVLibraryPreviewCard
          key={v.id}
          version={v}
          current={currentBaselineId === v.id}
          selected={selectedVId === v.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function CVLibraryFileRow({
  version,
  current,
  selected,
  onSelect,
}: {
  version: CVVersion
  current: boolean
  selected: boolean
  onSelect: (id: number) => void
}) {
  return (
    <button
      type="button"
      className={`cvb-library-file-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(version.id)}
      aria-current={selected ? "true" : undefined}
    >
      <span className={`cvb-library-file-icon ${kindTone(version)}${current ? " current" : ""}`}>
        <Icon name="file" size={15}/>
      </span>
      <span className="cvb-library-file-main">
        <span className="cvb-library-file-title">{formatLibraryDocumentTitle(version)}</span>
        <span className="cvb-library-file-meta">{documentMeta(version)}</span>
      </span>
      <span className="mono cvb-library-file-time">{timeAgo(version.created_at)}</span>
    </button>
  )
}

function CVLibraryPreviewCard({
  version,
  current,
  selected,
  onSelect,
}: {
  version: CVVersion
  current: boolean
  selected: boolean
  onSelect: (id: number) => void
}) {
  return (
    <button
      type="button"
      className={`cvb-library-preview-card ${selected ? "selected" : ""}`}
      onClick={() => onSelect(version.id)}
      aria-current={selected ? "true" : undefined}
    >
      <span className={`cvb-library-preview-thumb ${kindTone(version)}${current ? " current" : ""}`}>
        <span/>
        <span/>
        <span/>
        <span/>
      </span>
      <span className="cvb-library-preview-title">{formatLibraryDocumentTitle(version)}</span>
      <span className="cvb-library-preview-meta">{documentMeta(version)}</span>
      <span className="mono cvb-library-preview-time">{timeAgo(version.created_at)}</span>
    </button>
  )
}
