/**
 * AtsAudit — the single ATS & AI audit card.
 *
 * One render shared by the export surfaces AND the top-of-editor strip, so the
 * audit can never drift between "before download" and "while editing".
 *
 * When `onFix` is supplied, every failing check becomes actionable: the row
 * carries a Fix button that routes the user to the editor section that owns the
 * problem (`check.fix`). Without `onFix` (e.g. the anon preview, where there is
 * no editor to route to) the rows render read-only.
 */
"use client"

import { Icon } from "./icons"
import { atsScore, type AtsCheck, type AtsFixTarget } from "./ats-checks"

export function AtsAudit({
  checks,
  onFix,
  columns = 2,
}: {
  checks: AtsCheck[]
  onFix?: (target: AtsFixTarget) => void
  /** Grid columns; pass 1 for narrow rails. */
  columns?: 1 | 2
}) {
  const { passed, total } = atsScore(checks)
  const allPass = passed === total
  return (
    <div className="cvb-export-ats">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkle" size={14} style={{ color: "var(--tm-interactive)" }} />
          <span className="eyebrow" style={{ color: "var(--tm-interactive)" }}>ATS &amp; AI audit</span>
        </div>
        <span className="mono" style={{ fontSize: 10.5, color: allPass ? "var(--tm-success)" : "var(--tm-warning)" }}>
          passes {passed} / {total} checks
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 10 }}>
        {checks.map(c => <AuditRow key={c.label} check={c} onFix={onFix} />)}
      </div>
    </div>
  )
}

function AuditRow({ check, onFix }: { check: AtsCheck; onFix?: (target: AtsFixTarget) => void }) {
  const ok = check.pass
  const optional = Boolean(check.optional)
  // optional-missing reads as a neutral nudge, not a red failure.
  const tone = ok
    ? { fg: "var(--tm-success)", wash: "var(--tm-success-wash)", border: "rgba(74,222,128,0.3)" }
    : optional
      ? { fg: "var(--tm-text-faint)", wash: "var(--tm-surface-2, rgba(127,127,127,0.08))", border: "var(--tm-border-soft)" }
      : { fg: "var(--tm-warning)", wash: "var(--tm-warning-wash)", border: "rgba(245,158,11,0.3)" }
  const label = ok ? check.label : (check.detail ?? check.label)
  const canFix = !ok && check.fix && onFix

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tm-text-muted)" }}>
      <span style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        background: tone.wash, border: `1px solid ${tone.border}`,
        display: "grid", placeItems: "center", color: tone.fg,
      }}>
        <Icon name={ok ? "check" : optional ? "plus" : "x"} size={10} stroke={3} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {canFix && (
        <button
          type="button"
          className="cvb-ats-fix"
          onClick={() => onFix!(check.fix!)}
          aria-label={`Fix: ${check.label}`}
        >
          {optional ? "Add" : "Fix"}
          <Icon name="arrow-right" size={11} />
        </button>
      )}
    </div>
  )
}
