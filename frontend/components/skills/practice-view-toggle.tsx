"use client"

export type PracticeView = "practice" | "map" | "audit"

interface Seg {
  key: PracticeView
  label: string
  glyph: string
  hint: string
}

// Practice leads (primary, leftmost, heavier). Map/Audit are lighter secondary
// inspect detours — the toggle says "you're here to practice; inspect is one tap
// away." Map ⬡ / Audit ◈ glyphs match the canonical ADR-0003 triad vocabulary.
const SEGS: Seg[] = [
  { key: "practice", label: "Practice", glyph: "★", hint: "Build skills · edit CV pointers" },
  { key: "map", label: "Map", glyph: "⬡", hint: "Spatial domain radar" },
  { key: "audit", label: "Audit", glyph: "◈", hint: "Evidence walkthrough" },
]

interface Props {
  value: PracticeView
  onChange: (next: PracticeView) => void
  /** Pulse a live dot on the Practice segment when a session is running. */
  sessionRunning?: boolean
}

export function PracticeViewToggle({ value, onChange, sessionRunning = false }: Props) {
  return (
    <div role="tablist" aria-label="Practice view" className="tm-pv-toggle">
      {SEGS.map((seg) => {
        const active = value === seg.key
        const isPractice = seg.key === "practice"
        return (
          <button
            key={seg.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={`${seg.label} — ${seg.hint}`}
            className={`tm-pv-seg tm-control-focus${isPractice ? " is-primary" : ""}${active ? " is-active" : ""}`}
            onClick={() => onChange(seg.key)}
          >
            <span aria-hidden className="tm-pv-glyph">{seg.glyph}</span>
            <span>{seg.label}</span>
            {isPractice && sessionRunning && (
              <span aria-hidden className="tm-pv-live" title="Session running" />
            )}
          </button>
        )
      })}
    </div>
  )
}
