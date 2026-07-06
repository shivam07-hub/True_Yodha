"use client"

import * as React from "react"
import Link from "next/link"
import { useStreamingText } from "@/lib/hooks/use-streaming-text"
import { useCoinsGate } from "@/lib/hooks/use-xp-gate"
import { useXPStore } from "@/store/xpStore"
import { jobs as jobsApi, type JobMatch, type SkillGapItem } from "@/lib/api"
import { verdictColor, verdictLabel } from "@/lib/jobs/match-verdict"
import { CompanyLink } from "@/components/companies/company-link"
import { stripMarkdown } from "@/lib/text/strip-markdown"
import { MAX_LEVEL, sessionsForGap } from "@/lib/level-thresholds"
import { ForgeChip, type ForgeChipState } from "@/components/skills/forge-chip"

export function stripTaxonomySuffix(s: string): string {
  return s.replace(/\s*\((Programming Language|Software|Framework|Library)\)\s*$/i, "")
}

const ANALYSE_COST = 10

const MODE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
}

/** First-occurrence count phrase the scraper stores when a posting spans
 *  several cities ("2 Locations" / "multiple locations"). When the scraper has
 *  recovered the real cities into job.locations[] (firecrawl #6) we render those
 *  as chips; until then the only honest deeper view is the source posting. */
function isMultiLocation(loc: string): boolean {
  return /\b\d+\s*locations?\b|multiple locations|various locations/i.test(loc)
}

/** Honest location line (Q5). Real cities as chips when known (scalar or the
 *  locations[] array); otherwise the count phrase as a link to the source
 *  posting, plus a mode chip when it adds new info. */
/** Experience-range chip label from the scraper's min/max years (backlog #22). */
function experienceLabel(min?: number | null, max?: number | null): string | null {
  if (min != null && max != null) return min === max ? `${min} yrs` : `${min}–${max} yrs`
  if (min != null) return `${min}+ yrs`
  if (max != null) return `≤${max} yrs`
  return null
}

/**
 * Structured fact chips beneath the location line — each scraper column renders
 * as its own chip, never concatenated into the description (backlog #22).
 * Renders nothing when a row carries no structured facts (legacy / sparse).
 */
export function JobMetaChips({ job }: { job: JobMatch }) {
  const posted = job.date_posted?.trim() || null
  const seniority = job.seniority_level?.trim() || null
  const exp = experienceLabel(job.min_years_experience, job.max_years_experience)
  if (!posted && !seniority && !exp) return null
  return (
    <div className="db-meta">
      {posted ? <span className="db-metachip">Posted {posted}</span> : null}
      {seniority ? <span className="db-metachip">{seniority}</span> : null}
      {exp ? <span className="db-metachip">{exp}</span> : null}
    </div>
  )
}

export function LocationLine({ job }: { job: JobMatch }) {
  const loc = job.location?.trim() || null
  const scalarMode = job.location_mode && job.location_mode !== "unknown" ? job.location_mode : null
  // Fall back to the scraper's work_mode signal when the geocoded mode is unknown.
  const workMode = job.work_mode && job.work_mode.trim().toLowerCase() !== "unknown" ? job.work_mode.trim().toLowerCase() : null
  const rawMode = scalarMode ?? workMode
  const showMode = rawMode && (!loc || !loc.toLowerCase().includes(rawMode))
  const cities = (job.locations ?? []).filter((c) => c && c.trim())
  if (!loc && cities.length === 0 && !showMode) return null

  const multi = loc ? isMultiLocation(loc) : false
  return (
    <div className="db-loc">
      {cities.length > 0 ? (
        cities.map((c) => <span key={c} className="db-loc-text">{c}</span>)
      ) : loc ? (
        multi && job.source_url ? (
          <a
            className="db-loc-link"
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {loc} ↗
          </a>
        ) : (
          <span className="db-loc-text">{loc}</span>
        )
      ) : null}
      {showMode ? <span className={`db-loc-mode ${rawMode}`}>{MODE_LABEL[rawMode] ?? rawMode}</span> : null}
    </div>
  )
}

/** Collapsed-card JD preview — one fading line (Q2/Q6). */
export function jdSnippet(text: string | null | undefined, max = 160): string {
  if (!text) return ""
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

/**
 * Card body preview — prefers the LLM-enriched `job_summary` (clean ≤100-word
 * prose, no scrape junk) and falls back to a truncated `job_description` only on
 * legacy rows that predate enrichment. See HANDOFF_job_card_columns_20260604.
 */
export function cardSummary(job: { job_summary?: string | null; job_description?: string | null }): string {
  return jdSnippet(job.job_summary?.trim() || job.job_description)
}

interface LensProps {
  job: JobMatch
  skills: SkillGapItem[]
  loadingSkills: boolean
  token: string
  active: boolean
  cartSkillNames: Set<string>
  onSkillToggle: (s: SkillGapItem) => void
}

/* ── Lens 0: Overview ─────────────────────────────────────────────────────── */

export function LensOverview({ job, skills }: { job: JobMatch; skills: SkillGapItem[] }) {
  // The headline number is the Match Verdict (brain-spined + overlap-gated), not
  // raw skill overlap — a high-overlap/weak-brain job reads low, coherently.
  const fit = Math.max(0, Math.min(100, job.match_score))
  const matched = skills.filter((s) => (s.user_level ?? 0) > 0).slice(0, 3)
  return (
    <div className="db-lens db-lens--overview">
      <div className="db-ov-fit" style={{ ["--db-fit" as string]: `${fit}` }}>
        <div className="num">{fit}</div>
        <div className="lbl" style={{ color: verdictColor(job.verdict) }}>{verdictLabel(job.verdict)}</div>
      </div>
      <h2 className="db-ov-role">{job.title}</h2>
      <CompanyLink company={job.company} className="db-ov-sub" />
      <LocationLine job={job} />
      {matched.length > 0 ? (
        <div className="db-ov-pills">
          {matched.map((s) => (
            <span className="db-pill matched" key={s.skill}>
              ✓ {stripTaxonomySuffix(s.skill)}
            </span>
          ))}
        </div>
      ) : null}
      <Link className="db-ov-tailor" href={`/cv?jobId=${job.job_id}`}>
        Tailor &amp; apply →
      </Link>
    </div>
  )
}

/* ── Lens 1: Why you fit (streams) ────────────────────────────────────────── */

export function LensWhy({ job, token, active }: LensProps) {
  const stream = useStreamingText()
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const gate = useCoinsGate({ cost: ANALYSE_COST, action: "analyse_job" })
  const [started, setStarted] = React.useState(false)
  const [errMsg, setErrMsg] = React.useState<string | null>(null)
  const persisted = job.llm_explanation ? stripMarkdown(job.llm_explanation) : null

  const run = React.useCallback(() => {
    if (started) return
    setStarted(true)
    setErrMsg(null)
    stream.start(jobsApi.analyseStreamPath(job.job_id), token, (ev) => {
      const bal = typeof ev.new_coin_balance === "number" ? ev.new_coin_balance : null
      if (bal != null) applyXpChange({ newBalance: bal, action: "analyse_job" })
      if (ev.type === "error" && typeof ev.message === "string") setErrMsg(ev.message)
    })
  }, [started, stream, job.job_id, token, applyXpChange])

  // Auto-stream on first activation when funded; broke → discoverable button (no auto-modal).
  React.useEffect(() => {
    if (active && !persisted && !started && gate.canAfford) run()
  }, [active, persisted, started, gate.canAfford, run])

  if (persisted) {
    return (
      <div className="db-lens db-lens--why">
        <div className="db-lens-h">Why you fit</div>
        <blockquote className="db-why-quote">{persisted}</blockquote>
      </div>
    )
  }

  if (stream.status === "error") {
    return (
      <div className="db-lens db-lens--why">
        <div className="db-lens-h">Why you fit</div>
        <blockquote className="db-why-quote">
          {stream.text || errMsg || "Couldn't reach the model."}
        </blockquote>
        {stream.recoverable ? (
          <button type="button" className="db-mini-btn" onClick={() => { setStarted(false); setErrMsg(null); run() }}>
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  if (!started && !gate.canAfford) {
    return (
      <div className="db-lens db-lens--why">
        <div className="db-lens-h">Why you fit</div>
        <p className="db-lens-empty">See Myro&rsquo;s reasoning on why this role matches you.</p>
        <button type="button" className="db-mini-btn" onClick={() => gate.attempt(run)}>
          Analyse · {ANALYSE_COST} Myro Coins
        </button>
      </div>
    )
  }

  return (
    <div className="db-lens db-lens--why">
      <div className="db-lens-h">Why you fit</div>
      <blockquote className="db-why-quote">
        {stream.text}
        {stream.typing ? <span className="db-caret" aria-hidden /> : null}
      </blockquote>
    </div>
  )
}

/* ── Lens 2: Skills ───────────────────────────────────────────────────────── */

function SkillChipRow({
  skill,
  inCart,
  toLevelTarget,
  onToggle,
}: {
  skill: SkillGapItem
  inCart: boolean
  toLevelTarget: number
  onToggle: () => void
}) {
  const level = Math.max(0, Math.min(MAX_LEVEL, Math.round(skill.user_level ?? 0)))
  const target = Math.min(MAX_LEVEL, toLevelTarget)
  const sessions = level >= MAX_LEVEL ? 0 : sessionsForGap(level, target)
  const state: ForgeChipState = inCart ? "cart" : "idle"
  return (
    <div className="db-skill-row">
      <span className="name">{stripTaxonomySuffix(skill.skill)}</span>
      <span className="meta">
        <span className="lvl">L{level}→L{target}</span>
        <ForgeChip
          skillName={skill.skill}
          level={level}
          sessionsToNext={sessions}
          state={state}
          onClick={onToggle}
          ariaLabel={`${skill.skill} · push L${level} → L${target}`}
        />
      </span>
    </div>
  )
}

export function LensSkills({ skills, loadingSkills, cartSkillNames, onSkillToggle }: LensProps) {
  const matched = skills.filter((s) => (s.user_level ?? 0) > 0).slice(0, 6)
  const build = skills.filter((s) => (s.user_level ?? 0) === 0).slice(0, 6)
  if (loadingSkills && skills.length === 0) {
    return (
      <div className="db-lens db-lens--skills">
        <div className="db-lens-h">Skills</div>
        <p className="db-lens-empty">Loading…</p>
      </div>
    )
  }
  return (
    <div className="db-lens db-lens--skills">
      {matched.length > 0 ? (
        <>
          <div className="db-lens-h">You already match <span className="db-count">{matched.length}</span></div>
          <div className="db-skill-list">
            {matched.map((s) => {
              const cur = Math.max(0, Math.round(s.user_level ?? 0))
              return (
                <SkillChipRow
                  key={s.skill}
                  skill={s}
                  inCart={cartSkillNames.has(s.skill)}
                  toLevelTarget={cur + 1}
                  onToggle={() => onSkillToggle({ ...s, user_level: cur, required_level: cur + 1, missing: true })}
                />
              )
            })}
          </div>
        </>
      ) : null}
      {build.length > 0 ? (
        <>
          <div className="db-lens-h" style={{ marginTop: matched.length ? 16 : 0 }}>
            Skills to build <span className="db-count">{build.length}</span>
          </div>
          <div className="db-skill-list">
            {build.map((s) => (
              <SkillChipRow
                key={s.skill}
                skill={s}
                inCart={cartSkillNames.has(s.skill)}
                toLevelTarget={s.required_level ?? 1}
                onToggle={() => onSkillToggle(s)}
              />
            ))}
          </div>
        </>
      ) : null}
      {matched.length === 0 && build.length === 0 ? (
        <p className="db-lens-empty">No skill data for this role yet.</p>
      ) : null}
    </div>
  )
}
