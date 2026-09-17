"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type AgentPickItem, type JobFeedItem } from "@/lib/api"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { shareJobRole } from "@/lib/job-share"
import { agentPicksQueryKey } from "@/lib/jobs/job-triage-cache"
import { useAgentPickTriage } from "@/components/jobs/use-agent-pick-triage"
import { JobDetailSheet, type JobDetailData } from "./job-detail-sheet"
import { ApplyCapturePromptMobile } from "./apply-capture-prompt"
import { feedItemToRow } from "./job-model"
import { SwipeCard } from "./swipe-card"
import { AgentPickLede } from "@/components/jobs/agent-pick-lede"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   MobileAgentPicks — the same undecided SwipeCard as the Jobs feed (Skip /
   Share / Save, swipe-left = Skip, swipe-right = Save), carrying Myro's reason
   for the pick INSIDE the card (`lede`), exactly as the desktop band does. The
   reason used to sit above the card with its own rank marker and a tier word,
   so one job read as two objects.
   ══════════════════════════════════════════════════════════════════════════ */

export function MobileAgentPicks({
  token, context = "feed", onSave, onSkip,
}: {
  token: string
  context?: "feed" | "collections"
  onSave?: (job: JobFeedItem) => void
  onSkip?: (job: JobFeedItem) => void
}) {
  const router = useRouter()
  const { snack, closeSnack } = useMobileUI()
  const [openId, setOpenId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)
  const triage = useAgentPickTriage({ token, onSave, onSkip })

  const q = useQuery({
    queryKey: agentPicksQueryKey(token),
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
    job: {
      job_id: openItem?.job_id ?? "",
      source_url: openItem?.source_url ?? null,
      company: openItem?.company_name ?? null,
      listing_confidence: openItem?.is_stale || openItem?.is_active === false ? "uncertain" : undefined,
    },
    surface: "job_detail",
    intentSurface: "agent_pick",
    onFindSimilar: () => setOpenId(null),
  })

  const detailData: JobDetailData | null = useMemo(() => {
    if (!openItem) return null
    return {
      row: feedItemToRow(openItem),
      whyFit: openItem.agent_comment || (openItem.job_description ?? "").slice(0, 260),
      matched: openItem.matched_skills ?? [],
      gaps: (openItem.skills ?? []).filter(s => !(openItem.matched_skills ?? []).includes(s)),
      saved: false,
      hasApply: !!applyCapture.target.url,
      applyLabel: applyCapture.target.actionLabel ?? undefined,
    }
  }, [openItem, applyCapture.target.actionLabel, applyCapture.target.url])

  if (!picks.length) return null

  const persistLocally = !onSave && !onSkip

  const doSave = (pick: AgentPickItem, fromSheet?: boolean) => {
    triage.save(pick)
    if (fromSheet) setOpenId(null)
    if (persistLocally) {
      snack({
        msg: "Saved to Collections",
        action: "Tailor now",
        onAction: () => { closeSnack(); router.push(`/cv?jobId=${encodeURIComponent(pick.job_id)}`) },
      })
    }
  }
  const doSkip = (pick: AgentPickItem, fromSheet?: boolean) => {
    triage.skip(pick)
    if (fromSheet) setOpenId(null)
    if (persistLocally) {
      snack({ msg: "Hidden from your feed", action: "Undo", onAction: () => { triage.undo(); closeSnack() } })
    }
  }
  const doShare = (pick: AgentPickItem) => {
    void shareJobRole(pick).then(result => {
      if (result === "copied") {
        setSharedId(pick.job_id)
        window.setTimeout(() => setSharedId(null), 1500)
        snack({ msg: "Link copied" })
      }
    })
  }
  const doApply = () => {
    if (applyCapture.target.url) applyCapture.open()
    else snack({ msg: "No official opening found" })
  }

  return (
    <div className="mm-root">
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 2px 2px" }}>
        <span aria-hidden style={{ color: "var(--mm-accent)", fontSize: "var(--tm-fs-body)" }}>✦</span>
        <h2 style={{ margin: 0, fontSize: "var(--tm-fs-body)", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--mm-text)" }}>Myro Agent Picks</h2>
      </div>
      <p style={{ margin: "3px 2px 12px", fontSize: "var(--tm-fs-caption)", color: "var(--mm-faint)", lineHeight: 1.45 }}>
        Hand-vetted by Myro’s career brain for your level, goals and city. Start here.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {picks.map((pick, i) => (
          <SwipeCard
            key={pick.job_id}
            row={feedItemToRow(pick)}
            first={i === 0}
            hint={false}
            lede={<AgentPickLede pick={pick} />}
            onOpen={() => setOpenId(pick.job_id)}
            onSave={() => doSave(pick)}
            onSkip={() => doSkip(pick)}
            onShare={() => doShare(pick)}
            shared={sharedId === pick.job_id}
          />
        ))}
      </div>

      <div style={{ margin: "16px 0 4px", paddingTop: 14, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
        <p style={{ margin: 0, fontSize: "var(--tm-fs-caption)", color: "var(--mm-dim)", lineHeight: 1.5 }}>
          {context === "collections" ? (
            <><strong style={{ color: "var(--mm-muted)", fontWeight: 600 }}>Those are Myro’s picks for you.</strong> Your saved jobs are below.</>
          ) : (
            <><strong style={{ color: "var(--mm-muted)", fontWeight: 600 }}>Agent picks end here.</strong> More roles below are algorithm-matched on skill overlap, not hand-checked — save what fits.</>
          )}
        </p>
      </div>

      <JobDetailSheet
        open={!!openId}
        onClose={() => setOpenId(null)}
        data={detailData}
        onSave={() => openItem && doSave(openItem, true)}
        onSkip={() => openItem && doSkip(openItem, true)}
        onTailor={() => { if (openItem) { setOpenId(null); router.push(`/cv?jobId=${encodeURIComponent(openItem.job_id)}`) } }}
        onApply={doApply}
        captureSlot={openItem ? <ApplyCapturePromptMobile capture={applyCapture} /> : null}
      />
    </div>
  )
}
