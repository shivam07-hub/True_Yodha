/**
 * A blank section, opened from its `add ›` placeholder. Writes through on every
 * keystroke — the surface's own autosave is the save, so there is no second
 * "done" step to forget.
 */
"use client"

interface SectionDraftProps {
  value: string
  placeholder: string
  label: string
  onChange: (value: string) => void
}

export function SectionDraft({ value, placeholder, label, onChange }: SectionDraftProps) {
  return (
    <div className="cvw-card">
      <div className="cvw-line">
        <span className="cvw-gutter" aria-hidden />
        <div className="cvw-linebody">
          <textarea
            className="cvw-edit"
            rows={3}
            autoFocus
            value={value}
            placeholder={placeholder}
            aria-label={label}
            onChange={e => onChange(e.target.value)}
          />
        </div>
        <span aria-hidden />
      </div>
    </div>
  )
}
