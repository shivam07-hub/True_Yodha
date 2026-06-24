"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobs, type SkillGapItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/**
 * Instant, job-SPECIFIC readiness (T2-5). "Assess my readiness for this job" used
 * to route to the generic Skills/Forge page showing unrelated gaps; this answers
 * the literal question right where the user is — match% + the skills they have ✓
 * and the ones to close ✗ (each a one-tap Forge link), against THIS job's
 * requirements (`GET /jobs/{id}/skill-gap`, computed from the CV, no quiz).
 *
 * Strengths-first (ND1): lead with what matches, frame gaps as "to close", never
 * a punitive deficit list. Inline-styled to match the drawer it lives in.
 */
export function JobReadinessPanel({ token, jobId }: { token: string; jobId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: dataKeys.skillGap(jobId),
    queryFn: () => jobs.skillGap(token, jobId),
    staleTime: 10 * 60 * 1000,
  })

  if (isLoading) {
    return <p style={MUTED}>Checking your fit against this role…</p>
  }
  if (isError || !data) {
    return (
      <p style={MUTED}>
        Couldn’t load your readiness.{" "}
        <button type="button" onClick={() => refetch()} style={LINK_BTN}>Retry</button>
      </p>
    )
  }
  if (data.total_required === 0) {
    return <p style={MUTED}>No skill requirements listed for this role yet.</p>
  }

  const matchPct = Math.max(0, Math.min(100, 100 - data.gap_pct))
  const have = data.skills.filter((s) => !s.missing)
  const missing = data.skills.filter((s) => s.missing) // already sorted primary-first by the API
  const tone = matchPct >= 70 ? "var(--tm-success)" : matchPct >= 40 ? "var(--tm-warning)" : "var(--tm-text-muted)"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Headline: the number + a plain reading of it. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{matchPct}%</span>
        <span style={{ fontSize: 12.5, color: "var(--tm-text-muted)" }}>
          skill match — you have {have.length} of {data.total_required} required
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: "var(--tm-border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${matchPct}%`, borderRadius: 999, background: tone, transition: "width 600ms var(--tm-ease, ease)" }} />
      </div>

      {have.length > 0 ? (
        <div>
          <div style={LABEL}>You have</div>
          <div style={CHIP_ROW}>
            {have.slice(0, 8).map((s) => (
              <span key={s.skill} style={{ ...CHIP, color: "var(--tm-success)", borderColor: "var(--tm-success-border)", background: "var(--tm-success-wash)" }}>
                ✓ {s.skill}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <div>
          <div style={LABEL}>To close{missing.length > 6 ? ` (top ${6})` : ""}</div>
          <div style={CHIP_ROW}>
            {missing.slice(0, 6).map((s) => (
              <ForgeGapChip key={s.skill} skill={s} />
            ))}
          </div>
        </div>
      ) : (
        <p style={{ ...MUTED, color: "var(--tm-success)" }}>You meet every listed requirement for this role.</p>
      )}
    </div>
  )
}

/** A missing skill = one tap into Forge. Shows the level delta when we have a
 *  required level to aim at, so the gap is concrete (you're L1, this needs L3). */
function ForgeGapChip({ skill }: { skill: SkillGapItem }) {
  const delta = skill.required_level > 0 ? ` · L${skill.user_level}→L${skill.required_level}` : ""
  return (
    <Link
      href={`/forge?skill=${encodeURIComponent(skill.skill)}`}
      style={{ ...CHIP, color: "var(--tm-warning)", borderColor: "var(--tm-warning-border)", background: "var(--tm-warning-wash)", textDecoration: "none" }}
      title={`Practice ${skill.skill} in Forge`}
    >
      ✗ {skill.skill}{delta}
    </Link>
  )
}

const MUTED: React.CSSProperties = { margin: 0, fontSize: 12.5, color: "var(--tm-text-muted)" }
const LABEL: React.CSSProperties = { fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }
const CHIP_ROW: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 }
const CHIP: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, fontSize: 11, border: "1px solid var(--tm-border-soft)" }
const LINK_BTN: React.CSSProperties = { background: "none", border: "none", padding: 0, color: "var(--tm-interactive)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }
