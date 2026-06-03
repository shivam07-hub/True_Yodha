"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, users } from "@/lib/api"
import type { ApplicationResponse, CompanyPage } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useXPGate } from "@/lib/hooks/use-xp-gate"
import { useViewport } from "@/mobile"
import { useXPStore } from "@/store/xpStore"
import { XP_POLICY } from "@/lib/xp-policy"

const MAX_FOLLOWED = XP_POLICY.followedCompanyLimit

const LIVE_STAGES = ["saved", "applied", "screening", "interviewing", "final_round"] as const

interface Props {
  company: string
  open: boolean
  onClose: () => void
  onOpenJob?: (jobId: string) => void
}

async function fetchCompanyPage(name: string): Promise<CompanyPage | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(`${base}/companies/${encodeURIComponent(name)}`)
  if (!res.ok) return null
  return res.json()
}

export function CompanyDrawer({ company, open, onClose, onOpenJob }: Props) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const { isDesktop } = useViewport()
  const applyXpChange = useXPStore(s => s.applyXpChange)
  const gate = useXPGate({
    cost: XP_POLICY.followCompanyCost,
    action: "follow_company",
    floor: XP_POLICY.followCompanyFloor,
  })
  const [dragOffset, setDragOffset] = useState(0)
  const dragStart = useRef<number | null>(null)

  const followingQuery = useQuery({
    queryKey: ["followedCompanies"],
    queryFn: () => users.followedCompanies(token!),
    enabled: !!token && open,
    staleTime: 60_000,
  })

  const isFollowed = (followingQuery.data?.companies ?? []).some(c => c.company_name.toLowerCase() === company.toLowerCase())
  const followedCount = followingQuery.data?.total ?? 0
  const atCap = !isFollowed && followedCount >= MAX_FOLLOWED

  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token!),
    enabled: !!token && open,
    staleTime: 60_000,
  })

  const companyJobs: ApplicationResponse[] = (applicationsQuery.data ?? [])
    .filter(a => (a.company ?? "").toLowerCase() === company.toLowerCase())
    .filter(a => (LIVE_STAGES as readonly string[]).includes(a.status))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const companyPageQuery = useQuery({
    queryKey: ["company-page", company],
    queryFn: () => fetchCompanyPage(company),
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const followMutation = useMutation({
    mutationFn: () => users.followCompany(token!, company),
    onSuccess: (data) => {
      if (typeof data.new_xp_balance === "number") applyXpChange({ newBalance: data.new_xp_balance, action: "follow_company" })
      queryClient.invalidateQueries({ queryKey: ["followedCompanies"] })
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: () => users.unfollowCompany(token!, company),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followedCompanies"] }),
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const onTouchStart = (e: React.TouchEvent) => { dragStart.current = e.touches[0].clientY }
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return
    const delta = e.touches[0].clientY - dragStart.current
    if (delta > 0) setDragOffset(delta)
  }
  const onTouchEnd = () => {
    if (dragOffset > 80) onClose()
    setDragOffset(0)
    dragStart.current = null
  }

  const ghostPct = companyPageQuery.data?.ghost_rate != null ? Math.round(companyPageQuery.data.ghost_rate * 100) : null
  const rating = companyPageQuery.data?.avg_star_rating

  const panelStyle: React.CSSProperties = isDesktop
    ? {
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "92vw",
        zIndex: 201, background: "var(--tm-surface)", borderLeft: "1px solid var(--tm-border-soft)",
        display: "flex", flexDirection: "column",
        boxShadow: "-24px 0 60px rgba(0,0,0,0.4)",
        animation: "drawer-slide-in 220ms var(--tm-ease)",
      }
    : {
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
        background: "var(--tm-surface)", borderTop: "1px solid var(--tm-border-soft)",
        borderRadius: "16px 16px 0 0", maxHeight: "85dvh",
        display: "flex", flexDirection: "column",
        transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        transition: dragOffset > 0 ? "none" : "transform 200ms var(--tm-ease)",
      }

  return (
    <>
      <style>{`
        @keyframes drawer-slide-in { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>

      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)" }} />

      <div style={panelStyle} role="dialog" aria-label={`${company} drawer`}>
        {!isDesktop && (
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            role="button"
            aria-label="Swipe down to close"
            style={{ padding: "8px 0 8px", display: "flex", justifyContent: "center", touchAction: "none", cursor: "grab" }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--tm-border)" }} />
          </div>
        )}

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--tm-border-soft)", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4 }}>
            Company
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--tm-text)", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {company}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "var(--tm-interactive-rest)", fontSize: 20, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          {/* Mini stat row */}
          <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 12, color: "var(--tm-text-muted)" }}>
            <span style={{ fontFamily: "var(--tm-font-mono)" }}>
              <span style={{ color: "var(--tm-text-faint)" }}>RATING </span>
              <span style={{ color: "var(--tm-text)", fontWeight: 700 }}>
                {rating != null ? `${rating.toFixed(1)}★` : "—"}
              </span>
            </span>
            <span style={{ fontFamily: "var(--tm-font-mono)" }}>
              <span style={{ color: "var(--tm-text-faint)" }}>GHOST </span>
              <span style={{ color: ghostPct != null && ghostPct > 40 ? "var(--tm-danger)" : "var(--tm-text)", fontWeight: 700 }}>
                {ghostPct != null ? `${ghostPct}%` : "—"}
              </span>
            </span>
            <span style={{ fontFamily: "var(--tm-font-mono)" }}>
              <span style={{ color: "var(--tm-text-faint)" }}>OPEN </span>
              <span style={{ color: "var(--tm-text)", fontWeight: 700 }}>{companyJobs.length}</span>
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px" }}>
          {/* Follow toggle */}
          <button
            type="button"
            onClick={() => isFollowed
              ? unfollowMutation.mutate()
              : gate.attempt(() => followMutation.mutate())}
            disabled={atCap || followMutation.isPending || unfollowMutation.isPending}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: "var(--tm-radius-sm)",
              border: `1px solid ${isFollowed ? "var(--tm-warning-border)" : "var(--tm-int-border)"}`,
              background: isFollowed ? "var(--tm-warning-wash)" : "var(--tm-int-bg-wash)",
              color: isFollowed ? "var(--tm-warning)" : "var(--tm-interactive)",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              opacity: atCap ? 0.55 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
            title={atCap ? `Cap: ${MAX_FOLLOWED} companies` : ""}
          >
            {isFollowed ? "★ Following" : `☆ Follow · -${XP_POLICY.followCompanyCost} XP`}
          </button>

          {/* Saved jobs section */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
              Your saved jobs · {companyJobs.length}
            </div>
            {applicationsQuery.isLoading && (
              <div style={{ fontSize: 12, color: "var(--tm-text-faint)", padding: "10px 0" }}>Loading…</div>
            )}
            {!applicationsQuery.isLoading && companyJobs.length === 0 && (
              <div style={{ padding: 18, border: "1px dashed var(--tm-border-soft)", borderRadius: 8, textAlign: "center", fontSize: 12, color: "var(--tm-text-faint)" }}>
                No saved jobs at {company} yet.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {companyJobs.map(app => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => { onOpenJob?.(app.job_id); onClose() }}
                  style={{
                    textAlign: "left", padding: "12px 14px",
                    background: "var(--tm-surface-2)", border: "1px solid var(--tm-border-soft)",
                    borderRadius: "var(--tm-radius-sm)", cursor: "pointer", fontFamily: "inherit",
                    color: "var(--tm-text)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {app.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)", textTransform: "capitalize" }}>
                    stage · {app.status.replace("_", " ")}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--tm-border-soft)", flexShrink: 0, background: "var(--tm-surface)" }}>
          <Link
            href={`/companies/${encodeURIComponent(company)}`}
            onClick={onClose}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600, color: "var(--tm-interactive)", textDecoration: "none",
            }}
          >
            See reviews + funnel →
          </Link>
        </div>
      </div>
    </>
  )
}
