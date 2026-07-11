"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type AgentPickItem } from "@/lib/api"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { JobDetailSheet, type JobDetailData } from "./job-detail-sheet"
import { ApplyCapturePromptMobile } from "./apply-capture-prompt"
import { feedItemToRow, logoBg } from "./job-model"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   MobileAgentPicks — the curated "Myro Agent Picks" band, mm-native (matches the
   Jobs/Collections handoff look, not the desktop FeedCard). The Career-Ops brain's
   hand-vetted shortlist above the algorithm feed; tap a pick to open the same
   JobDetailSheet, ♥ to save. Renders nothing when the user has no picks.
   ══════════════════════════════════════════════════════════════════════════ */

const TIER_LABEL: Record<string, string> = { bullseye: "Bullseye", strong: "Strong", reach: "Reach" }

export function MobileAgentPicks({
  token, context = "feed",
}: {
  token: string
  context?: "feed" | "collections"
}) {
  const router = useRouter()
  const { snack, closeSnack } = useMobileUI()
  const [openId, setOpenId] = useState<string | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())

  const q = useQuery({
    queryKey: ["agentPicks", token],
    queryFn: () => jobsApi.agentPicks(token),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  })
  const picks = q.data?.picks ?? []
  const openItem = openId ? picks.find(p => p.job_id === openId) ?? null : null

  const applyCapture = useApplyCapture({
    token,
    job: { job_id: openItem?.job_id ?? "", source_url: openItem?.source_url ?? null, company: openItem?.company_name ?? null },
    surface: "job_detail",
    onFindSimilar: () => setOpenId(null),
  })

  const detailData: JobDetailData | null = useMemo(() => {
    if (!openItem) return null
    return {
      row: feedItemToRow(openItem),
      whyFit: openItem.agent_comment || (openItem.job_description ?? "").slice(0, 260),
      matched: openItem.matched_skills ?? [],
      gaps: (openItem.skills ?? []).filter(s => !(openItem.matched_skills ?? []).includes(s)),
      saved: saved.has(openItem.job_id),
      hasApply: !!applyCapture.target.url,
    }
  }, [openItem, saved, applyCapture.target.url])

  if (!picks.length) return null

  const doSave = (pick: AgentPickItem, fromSheet?: boolean) => {
    setSaved(prev => new Set(prev).add(pick.job_id))
    void jobsApi.saveJob(token, pick.job_id).catch(() => {
      setSaved(prev => { const next = new Set(prev); next.delete(pick.job_id); return next })
    })
    if (fromSheet) setOpenId(null)
    snack({ msg: "Saved to Collections", action: "Tailor now", onAction: () => { closeSnack(); router.push(`/cv?jobId=${encodeURIComponent(pick.job_id)}`) } })
  }
  const doApply = () => {
    if (applyCapture.target.url) applyCapture.open()
    else snack({ msg: "No apply link on this listing" })
  }

  return (
    <div className="mm-root">
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 2px 2px" }}>
        <span aria-hidden style={{ color: "var(--mm-accent)", fontSize: 14 }}>✦</span>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "#f2f2ee" }}>Myro Agent Picks</h2>
      </div>
      <p style={{ margin: "3px 2px 12px", fontSize: 11.5, color: "#8b8b84", lineHeight: 1.45 }}>
        Hand-vetted by Myro’s career brain for your level, goals and city. Start here.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {picks.map(pick => {
          const tier = (pick.agent_tier ?? "").toLowerCase()
          const co = pick.company_name ?? "—"
          const isSaved = saved.has(pick.job_id)
          return (
            <div
              key={pick.job_id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(pick.job_id)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(pick.job_id) } }}
              className="mm-press"
              style={{ textAlign: "left", cursor: "pointer", background: "#212120", border: "1px solid rgba(255,255,255,0.06)", borderLeft: `2px solid ${tier === "bullseye" ? "var(--mm-accent)" : "rgba(255,255,255,0.14)"}`, borderRadius: 16, padding: 13 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: logoBg(co), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flex: "none" }}>{co.slice(0, 1).toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, color: "#f2f2ee", lineHeight: 1.25 }}>{pick.job_title}</div>
                  <div style={{ fontSize: 11.5, color: "#8b8b84", marginTop: 1 }}>{co}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 99, fontSize: 10.5, fontWeight: 700, fontFamily: "var(--mm-mono, ui-monospace, monospace)", color: tier === "bullseye" ? "var(--mm-accent-fg)" : "#c9c9c2", background: tier === "bullseye" ? "var(--mm-accent)" : "#2a2a28", flex: "none" }}>{pick.agent_rank}</span>
              </div>
              <p style={{ margin: "9px 0 0", fontSize: 12.5, color: "#c9c9c2", lineHeight: 1.45 }}>{pick.agent_comment}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
                <button
                  onClick={e => { e.stopPropagation(); if (!isSaved) doSave(pick) }}
                  aria-label={isSaved ? "Saved" : "Save to Collections"}
                  className="mm-press-sm"
                  style={{ height: 30, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 13px", borderRadius: 99, border: isSaved ? "none" : "1px solid rgba(255,255,255,0.1)", background: isSaved ? "rgba(74,222,128,0.14)" : "transparent", color: isSaved ? "#4ade80" : "#f2f2ee", fontSize: 12, fontWeight: 600, cursor: isSaved ? "default" : "pointer", fontFamily: "inherit" }}
                >
                  {isSaved ? "✓ In Collections" : "♥ Save"}
                </button>
                {TIER_LABEL[tier] ? (
                  <span style={{ fontSize: 9.5, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "var(--mm-mono, ui-monospace, monospace)", color: tier === "bullseye" ? "var(--mm-accent)" : "#71716a" }}>{TIER_LABEL[tier]}</span>
                ) : null}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: "#8b8b84" }}>View →</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ margin: "16px 0 4px", paddingTop: 14, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "#71716a", lineHeight: 1.5 }}>
          {context === "collections" ? (
            <><strong style={{ color: "#a6a69e", fontWeight: 700 }}>Those are Myro’s picks for you.</strong> Your saved jobs are below.</>
          ) : (
            <><strong style={{ color: "#a6a69e", fontWeight: 700 }}>Agent picks end here.</strong> More roles below are algorithm-matched on skill overlap, not hand-checked — save what fits.</>
          )}
        </p>
      </div>

      <JobDetailSheet
        open={!!openId}
        onClose={() => setOpenId(null)}
        data={detailData}
        onHeart={() => openItem && doSave(openItem, true)}
        onSkip={() => setOpenId(null)}
        onTailor={() => { if (openItem) { setOpenId(null); router.push(`/cv?jobId=${encodeURIComponent(openItem.job_id)}`) } }}
        onApply={doApply}
        captureSlot={openItem ? <ApplyCapturePromptMobile capture={applyCapture} /> : null}
      />
    </div>
  )
}
