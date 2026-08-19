"use client"

import * as React from "react"
import type { JobMatch, JobPulse } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { fitTier } from "@/lib/dashboard/feed-model"
import { ageLabel, experienceLabel, type FeedCardData, type FitView } from "@/lib/jobs/card-view"
import { verdictLabel } from "@/lib/jobs/match-verdict"
import { CompanyLink, companyHref } from "@/components/companies/company-link"
import "./feed-card.css"

const MODE_LABEL: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" }
const CAREER_BAND_LABEL: Record<string, string> = {
  engineering_data: "Engineering & Data",
  business_product_operations: "Business, Product & Operations",
  research_people_public_impact: "Research, People & Public Impact",
  design_creative: "Design & Creative",
}

/** Deterministic per-company logo-tile colour. Replaces the letter-on-black
 *  monogram (the strongest "terminal" tell) with a warm coloured chip while we
 *  don't fetch real favicons. Same company → same hue every render. */
function logoStyle(company: string | null): React.CSSProperties {
  if (!company) return {}
  let h = 0
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) % 360
  return { "--fc-logo-bg": `hsl(${h} 52% 42%)`, "--fc-logo-ink": "#fff" } as React.CSSProperties
}

/* ── Fit indicator (the top-right slot — ONE component, every surface) ──────── */

/** Donut fit ring (0–100). Arc colour tracks the VERDICT (strong/worth_it/
 *  stretch), NOT the raw number — so the ring hue and the verdict word below it
 *  always agree and never disagree the way a green ring + orange word did. The
 *  number lives inside as detail. Falls back to the fit tier only when the brain
 *  hasn't ranked the card (no verdict). Internal — surfaces render <FitIndicator>. */
function FeedFitRing({ fit, size, verdict }: { fit: number; size: number; verdict?: JobMatch["verdict"] }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, fit)) / 100)
  const toneClass = verdict ? `verdict-${verdict}` : `fit-${fitTier(fit)}`
  return (
    <svg className={`fc-ring ${toneClass}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${fit} percent fit`}>
      <circle className="fc-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" />
      <circle className="fc-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text className="fc-ring-num" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{fit}</text>
    </svg>
  )
}

/**
 * The ONE fit slot. Every surface (dashboard ring, market skill-pill, upload
 * nudge) renders through here, driven by the `FitView` view-model the adapters
 * compute in `card-view.ts`. The ring-vs-pill choice lives in the data, not at
 * the call site — so adding a surface is one adapter, no new renderer.
 */
export function FitIndicator({ fit, size = 40 }: { fit: FitView; size?: number }) {
  if (!fit) return null
  switch (fit.kind) {
    case "score":
      // The ONE number + the verdict word — same template every surface reads.
      return (
        <span className="fc-fit-score">
          <FeedFitRing fit={fit.value} size={size} verdict={fit.verdict} />
          {fit.verdict ? (
            <span className={`fc-verdict fc-verdict-${fit.verdict}`}>{verdictLabel(fit.verdict)}</span>
          ) : null}
        </span>
      )
    case "overlap": {
      // Green wash is the *strong* fit signal — reserve it for 3+ overlaps so a
      // thin 1-skill match doesn't shout success (ND1) or clash with the company
      // monogram colour. 1–2 overlaps read in the quiet style.
      const strong = fit.count >= 3
      return (
        <span className={`fc-fitpill${strong ? " fc-fitpill-on" : ""}`}>
          ◉ {fit.count} skill{fit.count === 1 ? "" : "s"}
        </span>
      )
    }
    case "role":
      return <span className="fc-fitpill fc-fitpill-on">◉ your role</span>
    case "none":
      return <span className="fc-fitpill">no overlap yet</span>
    case "nudge":
      return (
        <a href="/cv" onClick={(e) => e.stopPropagation()} className="fc-fitpill fc-fitpill-nudge">
          Upload CV →
        </a>
      )
  }
}

/* ── Listing-confidence dim (D1) — surface-neutral, styled by feed-card.css ── */
export function feedCardConfidenceClass(pulse?: JobPulse): string {
  switch (pulse?.listing_confidence) {
    case "uncertain":
      return " fc-conf-uncertain"
    case "likely_closed":
    case "closed":
      return " fc-conf-closed"
    default:
      return ""
  }
}

/* ── The one card ─────────────────────────────────────────────────────────── */

export interface FeedCardProps {
  data: FeedCardData
  /** Top-right slot override. Normally omitted — the card renders <FitIndicator>
   *  from `data.fit`. Pass a node only to override (rare). */
  fit?: React.ReactNode
  /** Fit-ring diameter when the card auto-renders from `data.fit` (mobile = 44). */
  fitSize?: number
  /** Status chips beside the company (Applied / You added). */
  badges?: React.ReactNode
  /** Trust row above the actions — pass the live <PulseRow>. */
  pulse?: React.ReactNode
  /** Bottom action row — triage (market) or like/skip/tailor (dashboard). */
  actions?: React.ReactNode
  /** A card used as a single-choice control keeps skill evidence visible but
   * leaves the whole card as its only action. */
  allowGapActions?: boolean
  /** Per-section disclosure rail (Why fit · Match · Reach · JD) — rendered
   *  between the trust row and the actions. Fills the card's dead space with
   *  CTAs, not filler; each opens only its own panel inline. Row variant only. */
  rail?: React.ReactNode
  /** In-card save confirmation (journey B). Rendered below the actions the moment
   *  a job is captured — the <CaptureConfirm> band. Additive; omit when idle. */
  confirm?: React.ReactNode
  /** "row" = list card (identity tile + bottom actions); "compact" = role-led
   *  dense row for surfaces where the company is context (Intel, company pages);
   *  "immersive" = tall single-screen card (mobile). */
  variant?: "row" | "compact" | "immersive"
  open?: boolean
  leaving?: boolean
  /** Extra class — listing-confidence dim, hint shake, etc. */
  extraClass?: string
  onOpen?: () => void
  /** Spread onto the <article> — swipe transform + pointer handlers (immersive). */
  articleProps?: React.HTMLAttributes<HTMLElement>
}

export function FeedCard({
  data, fit, fitSize, badges, pulse, actions, rail, confirm, allowGapActions = true, variant = "row", open, leaving, extraClass = "", onOpen, articleProps,
}: FeedCardProps) {
  const age = ageLabel(data.ageIso)
  const exp = experienceLabel(data.minYears, data.maxYears)
  const showMode = data.locationMode && (!data.location || !data.location.toLowerCase().includes(data.locationMode))
  const hasLoc = data.locations.length > 0 || data.location || showMode
  const hasMeta = data.datePosted || data.careerBand || data.seniority || exp
  // The fit slot is derived from the data by default; an explicit `fit` node overrides.
  const fitNode = fit ?? <FitIndicator fit={data.fit} size={fitSize} />
  const hasFit = fit != null || data.fit != null
  // Pill-shaped fits (skill overlap / role / nudge) read as part of the header
  // line — company · time · skills — not as a detached right-hand column that
  // floats to the card edge on narrow mobile. The score *ring* stays its own
  // right column (that's its design).
  const fitInTop = fit == null && data.fit != null && data.fit.kind !== "score"

  // Compact density (Intel + company pages): the company is the page/pane context,
  // so the identity tile is dropped and the role leads, with fit + capture on the
  // role line. Same body atoms (fc-role / fc-loc / fc-chip) → one card language.
  const compact = variant === "compact"

  // Unified skill language: when the CV is known, lead with a "N/M skills" count
  // (matching the playground's Skills tab) + the top missing skills as one-tap
  // Forge gap CTAs. Matched skills fold into the count, not a wall of ✓ chips.
  const gapChips = data.skillCount ? data.chips.filter((c) => c.missing) : []
  const moreGaps = data.skillCount
    ? Math.max(0, (data.skillCount.total - data.skillCount.matched) - gapChips.length)
    : 0

  // A card is only a button when the whole row does something (opens a drawer).
  // Company-page rows have no whole-card action (Save is the only affordance), so
  // they render as a plain container — not a misleading focusable "button".
  const interactive = !!onOpen

  return (
    <article
      className={`fc-card fc-${variant}${interactive ? "" : " fc-static"}${open ? " is-open" : ""}${leaving ? " is-leaving" : ""}${extraClass}`}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-expanded": open,
            onClick: onOpen,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onOpen!()
              }
            },
          }
        : {})}
      {...articleProps}
    >
      <div className="fc-row">
        {/* Identity tile — dropped in compact density (company is the context). */}
        {compact ? null : data.company ? (
          <a
            href={companyHref(data.company)}
            target="_blank"
            rel="noopener noreferrer"
            className="fc-mono tm-company-link"
            style={logoStyle(data.company)}
            aria-hidden
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            {data.company.slice(0, 1)}
          </a>
        ) : (
          <span className="fc-mono" style={logoStyle(data.company)} aria-hidden>—</span>
        )}
        <div className="fc-body">
          {compact ? (
            // Role-led head: role · fit · capture on one line. Same fc-role type
            // as every other surface — only the arrangement is denser.
            <div className="fc-chead">
              <h3 className="fc-role">{data.role}</h3>
              {badges}
              {hasFit ? <span className="fc-chead-fit">{fitNode}</span> : null}
              {actions ? (
                <span className="fc-chead-actions" onClick={(e) => e.stopPropagation()}>{actions}</span>
              ) : null}
            </div>
          ) : (
            <>
              <div className={`fc-top${fitInTop ? " fc-top-inlinefit" : ""}`}>
                <CompanyLink company={data.company} className="fc-co" />
                {badges}
                {age ? <span className="fc-age">{age}</span> : null}
                {fitInTop ? fitNode : null}
              </div>
              <h3 className="fc-role">{data.role}</h3>
            </>
          )}

          {hasLoc || (compact && age) ? (
            <div className="fc-loc">
              {data.locations.length > 0
                ? data.locations.map((c) => <span key={c}>{c}</span>)
                : data.location ? <span>{data.location}</span> : null}
              {showMode ? <span className="fc-loc-mode">{MODE_LABEL[data.locationMode!] ?? data.locationMode}</span> : null}
              {compact && age ? <span className="fc-loc-age">{age}</span> : null}
            </div>
          ) : null}

          {hasMeta ? (
            <div className="fc-meta">
              {data.datePosted ? <span className="fc-metachip">Posted {data.datePosted}</span> : null}
              {data.careerBand ? <span className="fc-metachip">{CAREER_BAND_LABEL[data.careerBand] ?? data.careerBand}</span> : null}
              {data.seniority ? <span className="fc-metachip">{data.seniority}</span> : null}
              {exp ? <span className="fc-metachip">{exp}</span> : null}
            </div>
          ) : null}

          {data.skillCount ? (
            <div
              className="fc-chips"
              style={{ touchAction: "pan-x pan-y" }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span
                className={`fc-chip fc-chip-count${data.skillCount.matched >= 3 ? " is-strong" : ""}`}
                title={`Your CV covers ${data.skillCount.matched} of ${data.skillCount.total} required skills`}
              >
                <Check8 />
                {data.skillCount.matched}/{data.skillCount.total} skills
              </span>
              {gapChips.map((c) => (
                allowGapActions ? (
                  // A gap → one tap to start closing it. The chip IS the Forge CTA
                  // (design-over-words), so the card reads as "here's the path".
                  <a
                    key={c.name}
                    href={`/practice?skill=${encodeURIComponent(c.name)}`}
                    className="fc-chip is-gap"
                    title={`Practice ${c.name}`}
                    aria-label={`Missing: ${c.name}. Practice it`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Cross8 />
                    <span className="fc-chip-name">{c.name}</span>
                  </a>
                ) : (
                  <span key={c.name} className="fc-chip is-gap">
                    <Cross8 />
                    <span className="fc-chip-name">{c.name}</span>
                  </span>
                )
              ))}
              {moreGaps > 0 ? (
                <span className="fc-chip fc-chip-more">+{moreGaps} to close</span>
              ) : null}
            </div>
          ) : data.chips.length > 0 ? (
            <div
              className="fc-chips"
              style={{ touchAction: "pan-x pan-y" }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Anon / no-CV browse: the job's required skills, plain (no have/haven't split). */}
              {data.chips.map((c) => (
                <span key={c.name} className="fc-chip">
                  <span className="fc-chip-name">{c.name}</span>
                </span>
              ))}
              {data.extraChipCount > 0 ? (
                <span className="fc-chip fc-chip-more">+{data.extraChipCount}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {!compact && hasFit && !fitInTop ? <div className="fc-fit">{fitNode}</div> : null}
      </div>

      {data.move ? (
        <div className={`fc-move fc-move-${data.move.kind}`}>
          <span aria-hidden className="fc-move-arrow">→</span>
          {data.move.label}
        </div>
      ) : null}

      {pulse}
      {!compact && rail ? rail : null}
      {/* In compact density the capture lives in the head, not a bottom row. */}
      {!compact && actions ? <div className="fc-actions">{actions}</div> : null}
      {confirm}
    </article>
  )
}

/**
 * Loading shape for <FeedCard variant="row">. Co-located beside the real card so
 * a layout change forces this to move with it (the dashboard-loading grill Q13
 * doctrine — no central skeleton to orphan). Reuses the real `fc-*` classes, so
 * the live card lands in the exact same box with no reflow. The ONE feed-card
 * loading shape — every surface (market, dashboard, bootstrap) renders this, not
 * a hand-rolled box. Decorative; aria-hidden.
 */
export function FeedCardSkeleton() {
  return (
    <article className="fc-card fc-row" aria-hidden="true">
      <div className="fc-row">
        <Skeleton style={{ width: 34, height: 34, borderRadius: 10, flex: "0 0 auto" }} />
        <div className="fc-body">
          <Skeleton style={{ width: 110, height: 13, borderRadius: 4 }} />
          <Skeleton style={{ width: "72%", height: 17, borderRadius: 6 }} />
          <Skeleton style={{ width: 150, height: 12, borderRadius: 4 }} />
          <div className="fc-chips" style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <Skeleton style={{ width: 88, height: 22, borderRadius: "var(--tm-radius-pill)" }} />
            <Skeleton style={{ width: 116, height: 22, borderRadius: "var(--tm-radius-pill)" }} />
          </div>
        </div>
        <div className="fc-fit">
          <span className="fc-fit-score">
            <Skeleton style={{ width: 40, height: 40, borderRadius: "50%" }} />
            <Skeleton style={{ width: 44, height: 10, borderRadius: 4 }} />
          </span>
        </div>
      </div>
      <div className="fc-actions">
        <Skeleton style={{ height: 32, borderRadius: 8, flex: 1 }} />
        <Skeleton style={{ height: 32, borderRadius: 8, flex: 1 }} />
        <Skeleton style={{ width: 36, height: 32, borderRadius: 8, flex: "0 0 auto" }} />
      </div>
    </article>
  )
}

function Check8() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12.5l5 5L20 7" />
    </svg>
  )
}

function Cross8() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
