"use client"

import { useMemo, useState } from "react"
import type { JobCVVersion } from "@/lib/api"

interface VersionPickerProps {
  versions: JobCVVersion[]
  selectedId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
  onPolish: (id: number) => void
  onEdit: (id: number) => void
  onDownload: (text: string) => void
  isCreating: boolean
  isPolishing: boolean
  canCreate: boolean
}

function kindIcon(kind: JobCVVersion["version_kind"]): string {
  if (kind === "polished") return "◐"
  if (kind === "edited") return "✎"
  return "○"
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function VersionPicker({
  versions, selectedId, onSelect, onCreate, onPolish, onEdit, onDownload,
  isCreating, isPolishing, canCreate,
}: VersionPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(
    () => versions.find(v => v.id === selectedId) ?? versions[0] ?? null,
    [versions, selectedId],
  )

  const displayText = selected
    ? (selected.polished_text ?? selected.deterministic_text)
    : ""

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: "var(--tm-radius-lg)",
            background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
            color: "var(--tm-text)", fontFamily: "inherit", cursor: "pointer",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--tm-accent)", fontFamily: "var(--tm-font-mono)" }}>
              {selected ? `${kindIcon(selected.version_kind)} v${selected.job_version_number}` : "no versions yet"}
            </span>
            {selected && (
              <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                · {timeAgo(selected.created_at)} · {selected.hidden_items.length ? `${selected.hidden_items.length} hidden` : "all items kept"}
              </span>
            )}
          </span>
          <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>▾</span>
        </button>

        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
            zIndex: 20,
            background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
            borderRadius: "var(--tm-radius-lg)", boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            maxHeight: 360, overflowY: "auto",
          }}>
            {versions.length === 0 && (
              <div style={{ padding: "16px", fontSize: 12, color: "var(--tm-text-faint)" }}>
                No versions yet. Save your first one from the playground.
              </div>
            )}
            {versions.map(v => {
              const isActive = v.id === selected?.id
              return (
                <div
                  key={v.id}
                  onClick={() => { onSelect(v.id); setOpen(false) }}
                  style={{
                    padding: "10px 14px", cursor: "pointer",
                    borderBottom: "1px solid var(--tm-border-soft)",
                    background: isActive ? "rgba(0,245,212,0.06)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: isActive ? "var(--tm-accent)" : "var(--tm-text)" }}>
                      {kindIcon(v.version_kind)} v{v.job_version_number} · {v.version_kind}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{timeAgo(v.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 4 }}>
                    {v.title ?? "—"}
                    {v.parent_version_id ? <> · from v{versions.find(p => p.id === v.parent_version_id)?.job_version_number ?? "?"}</> : null}
                  </div>
                  {isActive && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <ActionPill
                        onClick={() => { onPolish(v.id); setOpen(false) }}
                        disabled={isPolishing}
                        label={isPolishing ? "Polishing…" : "★ Polish"}
                      />
                      {(v.version_kind === "polished" || v.version_kind === "edited") && (
                        <ActionPill
                          onClick={() => { onEdit(v.id); setOpen(false) }}
                          label="✎ Edit polished"
                        />
                      )}
                      <ActionPill
                        onClick={() => onDownload(v.polished_text ?? v.deterministic_text ?? "")}
                        label="📄 PDF"
                      />
                    </div>
                  )}
                </div>
              )
            })}
            <button
              onClick={() => { onCreate(); setOpen(false) }}
              disabled={!canCreate || isCreating}
              style={{
                width: "100%", padding: "10px 14px", textAlign: "left", border: "none",
                background: "transparent", cursor: canCreate ? "pointer" : "default",
                fontSize: 12, color: canCreate ? "var(--tm-accent)" : "var(--tm-text-faint)",
                fontFamily: "inherit",
              }}
            >
              {isCreating ? "Saving…" : "+ New version from playground"}
            </button>
          </div>
        )}
      </div>

      {/* Preview */}
      {displayText ? (
        <pre style={{
          margin: 0, padding: "20px 22px",
          background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-lg)",
          fontFamily: "var(--tm-font-mono)", fontSize: 12.5, lineHeight: 1.75,
          color: "var(--tm-text-muted)", whiteSpace: "pre-wrap",
          minHeight: 360,
        }}>{displayText}</pre>
      ) : (
        <div style={{
          padding: 32, textAlign: "center", color: "var(--tm-text-faint)",
          background: "var(--tm-surface)", border: "1px dashed var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-lg)", fontSize: 12,
        }}>
          No versions yet. Pick items in the playground and click <strong style={{ color: "var(--tm-accent)" }}>Save Version</strong> to create your first commit.
        </div>
      )}
    </div>
  )
}

function ActionPill({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 10px", borderRadius: 99,
        background: "transparent", border: "1px solid var(--tm-accent-ring)",
        color: "var(--tm-accent)", fontSize: 10, fontWeight: 600,
        cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
        opacity: disabled ? 0.5 : 1,
      }}
    >{label}</button>
  )
}
