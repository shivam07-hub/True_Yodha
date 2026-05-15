"use client"

import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import type { CompanyPage } from "@/lib/api"

const OUTCOME_LABELS: Record<string, string> = {
  ghosted: "Ghosted",
  rejected: "Rejected",
  offer: "Offer 🎉",
  withdrew: "Withdrew",
}

const STAGE_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  final_round: "Final Round",
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ color: "#FBBF24", letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ opacity: n <= Math.round(rating) ? 1 : 0.25 }}>★</span>
      ))}
    </span>
  )
}

async function fetchCompanyPage(slug: string): Promise<CompanyPage> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/companies/${encodeURIComponent(slug)}`)
  if (!res.ok) throw new Error("No reviews yet")
  return res.json()
}

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
      <div style={{ minHeight: "100vh", background: "var(--tm-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--tm-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--tm-text-faint)" }}>
        <div style={{ fontSize: 15 }}>No reviews for {companyName} yet.</div>
        <Link href="/" style={{ fontSize: 13, color: "var(--tm-accent)", textDecoration: "none" }}>← Back to Myro</Link>
      </div>
    )
  }

  const ghostPct = data.ghost_rate != null ? Math.round(data.ghost_rate * 100) : null

  return (
    <div style={{ minHeight: "100vh", background: "var(--tm-bg)", color: "var(--tm-text)", padding: "40px 24px", maxWidth: 680, margin: "0 auto" }}>
      <Link href="/" style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", letterSpacing: "0.08em", textTransform: "uppercase" }}>← Myro</Link>

      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", margin: "20px 0 4px" }}>{data.company_name}</h1>
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)", marginBottom: 24 }}>
        {data.review_count} verified review{data.review_count !== 1 ? "s" : ""}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 32 }}>
        <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Avg rating</div>
          {data.avg_star_rating != null ? (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1 }}>{data.avg_star_rating.toFixed(1)}</div>
              <Stars rating={data.avg_star_rating} />
            </>
          ) : <div style={{ color: "var(--tm-text-faint)" }}>—</div>}
        </div>

        <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Ghost rate</div>
          {ghostPct != null ? (
            <div style={{ fontSize: 28, fontWeight: 700, color: ghostPct > 40 ? "var(--tm-danger)" : ghostPct > 20 ? "var(--tm-warning)" : "var(--tm-success)", lineHeight: 1 }}>{ghostPct}%</div>
          ) : <div style={{ color: "var(--tm-text-faint)" }}>—</div>}
        </div>

        <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Drop-off stage</div>
          {Object.keys(data.stage_breakdown).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              {Object.entries(data.stage_breakdown).sort((a, b) => b[1] - a[1]).map(([stage, count]) => (
                <div key={stage} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ color: "var(--tm-text-muted)" }}>{STAGE_LABELS[stage] ?? stage}</span>
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>{count}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ color: "var(--tm-text-faint)" }}>—</div>}
        </div>
      </div>

      {/* Reviews */}
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--tm-text-faint)", marginBottom: 12 }}>Reviews</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.reviews.map((r, i) => (
          <div key={i} style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: r.written_note ? 10 : 0 }}>
              <Stars rating={r.star_rating} />
              <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
                Got to <strong style={{ color: "var(--tm-text-muted)" }}>{STAGE_LABELS[r.last_stage] ?? r.last_stage}</strong> · {OUTCOME_LABELS[r.outcome] ?? r.outcome}
              </span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>
                {new Date(r.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </span>
            </div>
            {r.written_note && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.65, borderLeft: "2px solid var(--tm-border)", paddingLeft: 12 }}>
                {r.written_note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
