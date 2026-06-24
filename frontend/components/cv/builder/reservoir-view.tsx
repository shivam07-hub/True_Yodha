/**
 * ReservoirView — the Master CV as a curatable "experience reservoir".
 *
 * Reads as a clean, scannable CV (one canonical line per achievement, role-grouped,
 * reverse-chron, old roles collapsed). The signature: each point's PHRASING DRAWER —
 * expand a line to see "this achievement, said N ways" and pick which phrasing is
 * canonical (the diamond), add a phrasing via Myro, or drop a weak one. Weak points
 * (no measurable result) carry a quiet "add the impact" nudge. Each role ends with a
 * brain-dump "add an achievement"; a one-time nudge points at the first one.
 *
 * Phase 1 (SHADOW): binds to RESERVOIR_FIXTURE with local-state curation so the design
 * is real and reviewable. Swapping to the live `GET/PATCH /cv/reservoir` later changes
 * the data source only. Reuses the cvb-* / --tm-* system + gap-session vocabulary.
 *
 * Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).
 */
"use client"

import { useMemo, useState } from "react"
import { Icon } from "./icons"
import {
  RESERVOIR_FIXTURE,
  SOURCE_LABEL,
  type PointVariant,
  type ReservoirPoint,
  type ReservoirRole,
  type ReservoirView as ReservoirData,
} from "./reservoir-fixture"
import "./reservoir-view.css"

export function ReservoirView({ data = RESERVOIR_FIXTURE }: { data?: ReservoirData }) {
  const [roles, setRoles] = useState<ReservoirRole[]>(data.roles)
  const [hintDismissed, setHintDismissed] = useState(false)

  const stats = useMemo(() => {
    let points = 0, phrasings = 0
    for (const r of roles) for (const p of r.points) { points++; phrasings += p.variants.length }
    return { points, phrasings }
  }, [roles])

  // Curation mutators — local in Phase 1; become PATCH /cv/reservoir calls later.
  function mutateRole(roleId: string, fn: (r: ReservoirRole) => ReservoirRole) {
    setRoles(rs => rs.map(r => (r.role_id === roleId ? fn(r) : r)))
  }
  function mutatePoint(roleId: string, pointKey: string, fn: (p: ReservoirPoint) => ReservoirPoint) {
    mutateRole(roleId, r => ({ ...r, points: r.points.map(p => (p.point_key === pointKey ? fn(p) : p)) }))
  }

  function makeCanonical(roleId: string, pointKey: string, variantId: string) {
    mutatePoint(roleId, pointKey, p => {
      const variants = p.variants.map(v => ({ ...v, is_canonical: v.id === variantId }))
      variants.sort((a, b) => Number(b.is_canonical) - Number(a.is_canonical))  // canonical first
      return { ...p, variants }
    })
  }
  function deleteVariant(roleId: string, pointKey: string, variantId: string) {
    mutatePoint(roleId, pointKey, p =>
      ({ ...p, variants: p.variants.filter(v => v.id !== variantId) }))
  }

  return (
    <div className="cvb-rv">
      <header className="cvb-rv-head">
        <div>
          <div className="cvb-rv-eyebrow"><Icon name="file" size={12} /> Your CV</div>
          <h1 className="cvb-rv-title">Experience reservoir</h1>
          <p className="cvb-rv-lede">
            Everything you&apos;ve done, kept in one place. Each role tailors itself from this —
            the cleaner this gets, the sharper every application.
          </p>
        </div>
        <div className="cvb-rv-stat" aria-label={`${stats.points} achievements, ${stats.phrasings} phrasings`}>
          <span className="cvb-rv-stat-num tabnum">{stats.points}</span>
          <span className="cvb-rv-stat-cap">achievements</span>
          <span className="cvb-rv-stat-sub mono">{stats.phrasings} phrasings</span>
        </div>
      </header>

      {data.summary && (
        <section className="cvb-rv-summary">
          <div className="cvb-rv-kicker">Summary</div>
          <p>{data.summary}</p>
        </section>
      )}

      <div className="cvb-rv-roles">
        {roles.map((role, i) => (
          <RoleBlock
            key={role.role_id}
            role={role}
            defaultOpen={i < 1}            // recent role open, older collapse
            firstHint={i === 0 && !hintDismissed}
            onDismissHint={() => setHintDismissed(true)}
            onMakeCanonical={(pk, vid) => makeCanonical(role.role_id, pk, vid)}
            onDeleteVariant={(pk, vid) => deleteVariant(role.role_id, pk, vid)}
          />
        ))}
      </div>

      {data.skills_line && (
        <section className="cvb-rv-tail">
          <div className="cvb-rv-kicker">Skills</div>
          <p className="cvb-rv-skills">{data.skills_line}</p>
        </section>
      )}
      {data.certs.length > 0 && (
        <section className="cvb-rv-tail">
          <div className="cvb-rv-kicker">Certifications</div>
          <ul className="cvb-rv-certs">
            {data.certs.map(c => <li key={c}>{c}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

// ── Role block: a CV job heading + its points, collapsible ────────────────────

function RoleBlock({ role, defaultOpen, firstHint, onDismissHint, onMakeCanonical, onDeleteVariant }: {
  role: ReservoirRole
  defaultOpen: boolean
  firstHint: boolean
  onDismissHint: () => void
  onMakeCanonical: (pointKey: string, variantId: string) => void
  onDeleteVariant: (pointKey: string, variantId: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const meta = [role.org, role.dates].filter(Boolean).join(" · ")

  return (
    <section className={`cvb-rv-role${open ? " open" : ""}`}>
      <button type="button" className="cvb-rv-role-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="cvb-rv-role-caret" aria-hidden><Icon name="chevron-right" size={14} /></span>
        <span className="cvb-rv-role-id">
          <span className="cvb-rv-role-title">{role.title}</span>
          {meta && <span className="cvb-rv-role-meta mono">{meta}</span>}
        </span>
        <span className="cvb-rv-role-count mono">{role.points.length} {role.points.length === 1 ? "point" : "points"}</span>
      </button>

      {open && (
        <div className="cvb-rv-points">
          {role.points.map(point => (
            <PointRow
              key={point.point_key}
              point={point}
              onMakeCanonical={vid => onMakeCanonical(point.point_key, vid)}
              onDeleteVariant={vid => onDeleteVariant(point.point_key, vid)}
            />
          ))}

          <div className="cvb-rv-add-wrap">
            <button type="button" className="cvb-rv-add">
              <Icon name="plus" size={13} /> Add an achievement
            </button>
            {firstHint && (
              <div className="cvb-rv-hint" role="note">
                Capture wins as they happen — they sharpen every future CV.
                <button type="button" className="cvb-rv-hint-x" aria-label="Dismiss" onClick={onDismissHint}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ── Point row: the clean CV line + its phrasing drawer (the signature) ─────────

function PointRow({ point, onMakeCanonical, onDeleteVariant }: {
  point: ReservoirPoint
  onMakeCanonical: (variantId: string) => void
  onDeleteVariant: (variantId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const canonical = point.variants.find(v => v.is_canonical) ?? point.variants[0]
  const ways = point.variants.length

  return (
    <div className={`cvb-rv-point${open ? " open" : ""}`}>
      <div className="cvb-rv-line">
        <span className="cvb-rv-bullet" aria-hidden />
        <span className="cvb-rv-line-text">{canonical?.text}</span>

        <div className="cvb-rv-line-aff">
          {point.needs_impact && (
            <span className="cvb-rv-weak" title="No measurable result yet">
              <Icon name="sparkle" size={11} /> add the impact
            </span>
          )}
          {ways > 1 && (
            <button type="button" className="cvb-rv-ways mono" onClick={() => setOpen(o => !o)}>
              {ways} ways
            </button>
          )}
          <button
            type="button"
            className="cvb-rv-expand"
            aria-expanded={open}
            aria-label={open ? "Hide phrasings" : "Show phrasings"}
            onClick={() => setOpen(o => !o)}
          >
            <Icon name="chevron-down" size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className="cvb-rv-drawer">
          {point.variants.map(v => (
            <VariantRow
              key={v.id}
              variant={v}
              canDelete={ways > 1 && !v.is_canonical}
              onMakeCanonical={() => onMakeCanonical(v.id)}
              onDelete={() => onDeleteVariant(v.id)}
            />
          ))}
          <button type="button" className="cvb-rv-add-phrasing">
            <Icon name="sparkle" size={12} /> Add a phrasing with Myro
          </button>
        </div>
      )}
    </div>
  )
}

// ── Variant row inside the drawer — the canonical diamond is the one bold device ──

function VariantRow({ variant, canDelete, onMakeCanonical, onDelete }: {
  variant: PointVariant
  canDelete: boolean
  onMakeCanonical: () => void
  onDelete: () => void
}) {
  const provenance = SOURCE_LABEL[variant.source]
  return (
    <div className={`cvb-rv-variant${variant.is_canonical ? " canonical" : ""}`}>
      <button
        type="button"
        className="cvb-rv-pick"
        aria-pressed={variant.is_canonical}
        aria-label={variant.is_canonical ? "On your CV" : "Use this phrasing on your CV"}
        disabled={variant.is_canonical}
        onClick={onMakeCanonical}
      >
        <Icon name="diamond" size={13} />
      </button>

      <div className="cvb-rv-variant-body">
        <span className="cvb-rv-variant-text">{variant.text}</span>
        <div className="cvb-rv-variant-meta">
          {variant.is_canonical && <span className="cvb-rv-oncv">on your CV</span>}
          {variant.audience_tags.map(t => <span key={t} className="cvb-rv-tag mono">{t}</span>)}
          {provenance && <span className="cvb-rv-prov mono">{provenance}</span>}
        </div>
      </div>

      {canDelete && (
        <button type="button" className="cvb-rv-del" aria-label="Delete this phrasing" onClick={onDelete}>
          <Icon name="trash" size={13} />
        </button>
      )}
    </div>
  )
}
