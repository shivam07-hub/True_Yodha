"use client"

import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import type { CompanyPage, CompanyReviewItem } from "@/lib/api"
import { ParticleLoading } from "@/components/ui/particle-loading"

// ── Constants ────────────────────────────────────────────────────────────────

const OUTCOME_META: Record<string, { label: string; color: string; bg: string }> = {
  ghosted:   { label: "Ghosted",   color: "var(--tm-danger)",   bg: "rgba(251,113,133,0.08)" },
  rejected:  { label: "Rejected",  color: "var(--tm-warning)",  bg: "rgba(251,191,36,0.08)"  },
  offer:     { label: "Offer 🎉",  color: "var(--tm-success)",  bg: "rgba(74,222,128,0.08)"  },
  withdrew:  { label: "Withdrew",  color: "var(--tm-text-faint)", bg: "rgba(255,255,255,0.04)" },
}

const STAGE_LABELS: Record<string, string> = {
  saved: "Saved", applied: "Applied", screening: "Screening",
  interviewing: "Interviewing", final_round: "Final Round",
}

const STAGE_ORDER = ["saved", "applied", "screening", "interviewing", "final_round"]

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchCompanyPage(name: string): Promise<CompanyPage> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(`${base}/companies/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error("No reviews yet")
  return res.json()
}

function Stars({ rating, size = 18 }: { rating: number; size?: number }) {
  const filled = Math.round(rating)
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ fontSize: size, color: n <= filled ? "#FBBF24" : "rgba(255,255,255,0.12)", lineHeight: 1 }}>★</span>
      ))}
    </span>
  )
}

function InteractiveStars({ rating }: { rating: number }) {
  const [hovered, setHovered] = useState(0)
  const display = hovered || Math.round(rating)
  return (
    <span style={{ display: "inline-flex", gap: 3 }} onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onMouseEnter={() => setHovered(n)}
          style={{
            fontSize: 28, lineHeight: 1, cursor: "default",
            color: n <= display ? "#FBBF24" : "rgba(255,255,255,0.12)",
            transition: "color 80ms ease, transform 80ms ease",
            transform: n <= display ? "scale(1.08)" : "scale(1)",
            display: "inline-block",
          }}
        >★</span>
      ))}
    </span>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
      borderRadius: 12, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 6,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 100% 0%, ${accent ?? "rgba(0,245,212,0.04)"}, transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--tm-text)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>{sub}</div>}
    </div>
  )
}

function FunnelBar({ stage, count, max }: { stage: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 80, fontSize: 11, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", flexShrink: 0, textAlign: "right" }}>
        {STAGE_LABELS[stage] ?? stage}
      </div>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: "var(--tm-accent)", transition: "width 600ms cubic-bezier(0.16,1,0.3,1)", boxShadow: "0 0 8px rgba(0,245,212,0.3)" }} />
      </div>
      <div style={{ width: 24, fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-muted)", textAlign: "right", flexShrink: 0 }}>{count}</div>
    </div>
  )
}

function ReviewCard({ review, index }: { review: CompanyReviewItem; index: number }) {
  const outcome = OUTCOME_META[review.outcome] ?? { label: review.outcome, color: "var(--tm-text-faint)", bg: "rgba(255,255,255,0.04)" }
  return (
    <div style={{
      background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 12,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12,
      animation: `fadeUp 300ms ${index * 40}ms both cubic-bezier(0.16,1,0.3,1)`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Stars rating={review.star_rating} size={15} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, padding: "3px 9px", borderRadius: 99,
              background: outcome.bg, color: outcome.color,
              border: `1px solid ${outcome.color}40`,
              fontFamily: "var(--tm-font-mono)", letterSpacing: "0.04em",
            }}>
              {outcome.label}
            </span>
            <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
              Reached <strong style={{ color: "var(--tm-text-muted)", fontWeight: 500 }}>{STAGE_LABELS[review.last_stage] ?? review.last_stage}</strong>
            </span>
          </div>
        </div>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", flexShrink: 0, paddingTop: 2 }}>
          {new Date(review.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
        </div>
      </div>
      {review.written_note && (
        <p style={{
          margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--tm-text-muted)",
          borderLeft: "2px solid var(--tm-accent-ring)", paddingLeft: 14,
        }}>
          {review.written_note}
        </p>
      )}
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ name }: { name: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--tm-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 48, color: "rgba(255,255,255,0.06)", letterSpacing: "-0.04em", userSelect: "none" }}>?</div>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--tm-text)" }}>{name}</div>
        <div style={{ fontSize: 13, color: "var(--tm-text-faint)", maxWidth: 320 }}>No verified reviews yet. Be the first to share your candidate experience.</div>
      </div>
      <Link href="/home" style={{
        padding: "10px 22px", borderRadius: 99, background: "var(--tm-accent)",
        color: "var(--tm-accent-fg)", fontSize: 13, fontWeight: 600, textDecoration: "none",
        fontFamily: "inherit",
      }}>
        Track your application →
      </Link>
      <Link href="/market" style={{ fontSize: 12, color: "var(--tm-text-faint)", textDecoration: "none" }}>← Back to Intel</Link>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyPageRoute() {
  const { slug } = useParams<{ slug: string }>()
  const companyName = decodeURIComponent(slug)

  const { data, isLoading, error } = useQuery({
    queryKey: ["company-page", companyName],
    queryFn: () => fetchCompanyPage(companyName),
    retry: false,
  })

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--tm-bg)" }}>
        <ParticleLoading message="Loading company intelligence…" height={600} />
      </div>
    )
  }

  if (error || !data) return <EmptyState name={companyName} />

  const ghostPct = data.ghost_rate != null ? Math.round(data.ghost_rate * 100) : null
  // Sort stages by canonical order, fill gaps with 0
  const funnelStages = STAGE_ORDER.map(s => ({ stage: s, count: data.stage_breakdown[s] ?? 0 })).filter(x => x.count > 0)
  const maxStageCount = Math.max(...funnelStages.map(x => x.count), 1)

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--tm-bg)", color: "var(--tm-text)" }}>
        {/* Hero band */}
        <div style={{ borderBottom: "1px solid var(--tm-border-soft)", padding: "32px 32px 28px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 60% 0%, rgba(0,245,212,0.05), transparent 60%)", pointerEvents: "none" }} />
          <div style={{ maxWidth: 860, margin: "0 auto", position: "relative" }}>
            <Link href="/market" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-accent)" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-text-faint)" }}
            >
              ← Myro
            </Link>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 8 }}>
              CANDIDATE EXPERIENCE
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--tm-text)", lineHeight: 1 }}>
                {data.company_name}
              </h1>
              <InteractiveStars rating={data.avg_star_rating ?? 0} />
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)" }}>
              {data.review_count} verified review{data.review_count !== 1 ? "s" : ""}
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
              based on real applications tracked in Myro
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 32px 80px" }}>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 32 }}>
            <StatCard
              label="Avg rating"
              value={data.avg_star_rating != null ? data.avg_star_rating.toFixed(1) : "—"}
              sub={data.avg_star_rating != null ? "out of 5" : "No reviews yet"}
              accent="rgba(251,191,36,0.06)"
            />
            <StatCard
              label="Ghost rate"
              value={ghostPct != null ? `${ghostPct}%` : "—"}
              sub={ghostPct != null ? (ghostPct > 40 ? "High — apply with caution" : ghostPct > 20 ? "Moderate" : "Low — responsive team") : undefined}
              accent={ghostPct != null && ghostPct > 40 ? "rgba(251,113,133,0.06)" : undefined}
            />
            <StatCard
              label="Reviews"
              value={String(data.review_count)}
              sub="verified applications"
            />
          </div>

          {/* Funnel + reviews row */}
          <div style={{ display: "grid", gridTemplateColumns: funnelStages.length > 0 ? "1fr 1.8fr" : "1fr", gap: 20 }}>
            {/* Funnel */}
            {funnelStages.length > 0 && (
              <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 12, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>Where candidates drop off</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {funnelStages.map(({ stage, count }) => (
                    <FunnelBar key={stage} stage={stage} count={count} max={maxStageCount} />
                  ))}
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--tm-border-soft)", fontSize: 11, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)" }}>
                  Last stage reached before outcome
                </div>
              </div>
            )}

            {/* Reviews */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4 }}>
                Reviews
              </div>
              {data.reviews.map((r, i) => (
                <ReviewCard key={i} review={r} index={i} />
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ marginTop: 48, padding: "28px 32px", background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 0% 50%, rgba(0,245,212,0.05), transparent 50%)", pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>Applied to {data.company_name}?</div>
              <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>Track your application. Leave a verified review when it closes.</div>
            </div>
            <Link href="/home" style={{
              flexShrink: 0, padding: "10px 22px", borderRadius: 99,
              background: "var(--tm-accent)", color: "var(--tm-accent-fg)",
              fontSize: 13, fontWeight: 600, textDecoration: "none", fontFamily: "inherit",
              position: "relative",
            }}>
              Start tracking →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
