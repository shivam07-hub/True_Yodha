"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type JobFeedItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { DEFAULT_FILTERS } from "@/components/market/feed-types"
import { useJobFeed } from "@/components/market/use-job-feed"
import { IntentChat } from "@/components/jobs/intent-chat"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { BottomSheet } from "./bottom-sheet"
import { JobDetailSheet, type JobDetailData } from "./job-detail-sheet"
import { ApplyCapturePromptMobile } from "./apply-capture-prompt"
import { SwipeCard } from "./swipe-card"
import { feedItemToRow } from "./job-model"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   JobsSurface — the handoff Jobs tab: swipe-triage feed over the REAL market
   feed (useJobFeed). Sort (Best fit/Newest) ↔ fit/fresh · server search ·
   client-side Work-mode + hide-"check details" filters · hidden-jobs (eye)
   view with restore · job-detail sheet. Save/Skip drain the queue + snack.
   ══════════════════════════════════════════════════════════════════════════ */

type Mode = "any" | "onsite" | "hybrid" | "remote"

export function JobsSurface({ token, targetLocations }: { token: string; targetLocations: string[] }) {
  const router = useRouter()
  const { snack, closeSnack, openPractice } = useMobileUI()

  const [sort, setSort] = useState<"best" | "new">("best")
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState("")
  const [eyeOn, setEyeOn] = useState(false)
  const [mode, setMode] = useState<Mode>("any")
  const [hideCheck, setHideCheck] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)
  const [intentOpen, setIntentOpen] = useState(false)

  const filters = useMemo(() => ({ ...DEFAULT_FILTERS, sort: sort === "best" ? "fit" as const : "fresh" as const }), [sort])
  const { allJobs, total, warming, triage, undo } = useJobFeed({ token, filters, q: searchQ, skill: null, targetLocations })

  const filtered = useMemo(() => {
    let f = allJobs
    if (mode !== "any") f = f.filter(j => (j.location_mode ?? "").toLowerCase() === mode)
    if (hideCheck) f = f.filter(j => !(j.legitimacy_tier === "caution" || j.legitimacy_tier === "suspicious" || j.is_stale))
    return f
  }, [allJobs, mode, hideCheck])

  const rows = useMemo(() => filtered.map(feedItemToRow), [filtered])
  const detailItem = detailId ? allJobs.find(j => j.job_id === detailId) ?? null : null
  // Apply Transport — arms the liveness capture whenever the user leaves to
  // apply from the detail sheet; careers-search fallback when no portal link.
  const applyCapture = useApplyCapture({
    token,
    job: { job_id: detailItem?.job_id ?? "", source_url: detailItem?.source_url ?? null, company: detailItem?.company_name ?? null },
    surface: "job_detail",
    onFindSimilar: () => setDetailId(null),
  })

  const locationLabel = targetLocations.find(l => l && l.trim())?.trim() ?? ""
  const countLine = `${filtered.length} of ${total || filtered.length} live${locationLabel ? ` · ${locationLabel}` : ""}`

  const doSave = (job: JobFeedItem, fromSheet?: boolean) => {
    triage(job, "saved")
    if (fromSheet) setDetailId(null)
    snack({ msg: "Saved to Collections", action: "Tailor now", onAction: () => { closeSnack(); router.push(`/cv/tailor?jobId=${encodeURIComponent(job.job_id)}`) } })
  }
  const doSkip = (job: JobFeedItem, fromSheet?: boolean) => {
    triage(job, "skipped")
    if (fromSheet) setDetailId(null)
    snack({ msg: "Hidden from your feed", action: "Undo", onAction: () => { undo(); closeSnack() } })
  }
  const doShare = (job: JobFeedItem) => {
    const url = job.source_url ?? `${typeof window !== "undefined" ? window.location.origin : ""}/companies`
    void navigator.clipboard?.writeText(url).catch(() => {})
    setSharedId(job.job_id)
    setTimeout(() => setSharedId(null), 1500)
    snack({ msg: "Link copied" })
  }
  const doTailor = (jobId: string) => { setDetailId(null); router.push(`/cv/tailor?jobId=${encodeURIComponent(jobId)}`) }
  const doApply = () => {
    if (applyCapture.target.url) applyCapture.open()
    else snack({ msg: "No apply link on this listing" })
  }

  const detailData: JobDetailData | null = detailItem
    ? {
        row: feedItemToRow(detailItem),
        whyFit: (detailItem.job_description ?? "").slice(0, 260),
        matched: detailItem.matched_skills ?? [],
        gaps: (detailItem.skills ?? []).filter(s => !(detailItem.matched_skills ?? []).includes(s)),
        saved: false,
        hasApply: !!applyCapture.target.url,
      }
    : null

  return (
    <div data-screen-label="Jobs" className="mm-root" style={{ background: "var(--mm-bg)", minHeight: "100%", animation: "mm-screenIn 240ms cubic-bezier(0.16,1,0.3,1)" }}>
      {/* header */}
      <div style={{ padding: "10px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: "-0.03em" }}>Jobs</h1>
          <span style={{ fontSize: 12, color: "#8b8b84", fontVariantNumeric: "tabular-nums" }}>{countLine}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setSearchOpen(o => !o)} aria-label="Search" style={roundIcon}><svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg></button>
          <button onClick={() => setEyeOn(o => !o)} aria-label="Hidden jobs" style={{ ...roundIcon, background: eyeOn ? "rgba(255,255,255,0.08)" : "transparent", color: eyeOn ? "#f2f2ee" : "#a6a69e" }}><svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /><path d="M4 4l16 16" /></svg></button>
        </div>

        {searchOpen ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Company or role" autoFocus style={{ flex: 1, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "#232322", color: "#f2f2ee", padding: "0 12px", fontSize: 14, outline: "none", fontFamily: "inherit" }} />
            <button onClick={() => { setSearchOpen(false); setSearchQ("") }} style={{ height: 36, padding: "0 12px", borderRadius: 10, border: "none", background: "transparent", color: "#a6a69e", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ display: "flex", flex: "none", background: "#262624", borderRadius: 9, padding: 2 }}>
              <SegBtn on={sort === "best"} onClick={() => setSort("best")}>Best fit</SegBtn>
              <SegBtn on={sort === "new"} onClick={() => setSort("new")}>Newest</SegBtn>
            </div>
            <button onClick={() => setFiltersOpen(true)} style={{ height: 32, display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#c9c9c2", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
              {mode !== "any" || hideCheck ? "Filters · on" : "Filters"}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setIntentOpen(true)} style={{ border: "none", background: "transparent", color: "#8b8b84", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}>Not it? Tell Myro →</button>
          </div>
        )}
      </div>

      {/* body */}
      <div style={{ padding: "2px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {eyeOn ? (
          <HiddenView token={token} snack={snack} />
        ) : warming && rows.length === 0 ? (
          <FeedSkeleton />
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Feed clear 🎯</div>
            <div style={{ fontSize: 12.5, color: "#8b8b84", lineHeight: 1.5 }}>You&apos;ve triaged everything here.<br />Next: tailor a CV for what you saved.</div>
            <button onClick={() => router.push("/collections")} className="mm-press" style={ctaBtn}>Open Collections</button>
          </div>
        ) : (
          rows.map((row, i) => {
            const job = filtered[i]
            return (
              <SwipeCard
                key={row.id}
                row={row}
                first={i === 0}
                hint={i === 0}
                shared={sharedId === row.id}
                onOpen={() => setDetailId(row.id)}
                onSave={() => doSave(job)}
                onSkip={() => doSkip(job)}
                onShare={() => doShare(job)}
              />
            )
          })
        )}
      </div>

      <JobDetailSheet
        open={!!detailId}
        onClose={() => setDetailId(null)}
        data={detailData}
        onHeart={() => detailItem && doSave(detailItem, true)}
        onSkip={() => detailItem && doSkip(detailItem, true)}
        onTailor={() => detailItem && doTailor(detailItem.job_id)}
        onApply={doApply}
        onPractice={() => { setDetailId(null); openPractice() }}
        captureSlot={detailItem ? <ApplyCapturePromptMobile capture={applyCapture} /> : null}
      />

      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        locationLabel={locationLabel}
        mode={mode}
        setMode={setMode}
        hideCheck={hideCheck}
        setHideCheck={setHideCheck}
        resultN={filtered.length}
      />

      {/* The real Delta-4 loop (same component the desktop app uses): the user
          tells Myro what's off → one-tap filter change → feed re-runs. */}
      <IntentChat open={intentOpen} onClose={() => setIntentOpen(false)} />
    </div>
  )
}

function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ height: 28, padding: "0 14px", borderRadius: 7, border: "none", background: on ? "#3a3a36" : "transparent", color: on ? "#f2f2ee" : "#8b8b84", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 180ms" }}>
      {children}
    </button>
  )
}

function FeedSkeleton() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: "#212120", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 16, padding: 14, height: 128, opacity: 1 - i * 0.18, animation: "mm-stepPulse 1.4s ease infinite" }} />
      ))}
    </>
  )
}

function HiddenView({ token, snack }: { token: string; snack: (s: { msg: string }) => void }) {
  const qc = useQueryClient()
  const hidden = useQuery({ queryKey: dataKeys.hiddenJobs(), queryFn: () => jobsApi.hiddenJobs(token), enabled: !!token })
  const restore = useMutation({
    mutationFn: (jobId: string) => jobsApi.unskipJob(token, jobId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.hiddenJobs() })
      snack({ msg: "Back in your feed" })
    },
  })
  const list = hidden.data ?? []
  return (
    <>
      <div style={{ fontSize: 12, color: "#8b8b84", padding: "2px 2px 4px" }}>Hidden roles stay out of your feed. Restore any time.</div>
      {list.map(row => {
        const co = row.company_name ?? "—"
        return (
          <div key={row.job_id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#212120", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#2a2a28", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#c9c9c2", flex: "none" }}>{co.slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.job_title}</div>
              <div style={{ fontSize: 11.5, color: "#8b8b84" }}>{co}</div>
            </div>
            <button onClick={() => restore.mutate(row.job_id)} className="mm-press-sm" style={{ height: 30, padding: "0 12px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#f2f2ee", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Restore</button>
          </div>
        )
      })}
      {!hidden.isLoading && list.length === 0 && <div style={{ textAlign: "center", color: "#71716a", fontSize: 12.5, padding: "28px 0" }}>Nothing hidden yet.</div>}
    </>
  )
}

function FiltersSheet({ open, onClose, locationLabel, mode, setMode, hideCheck, setHideCheck, resultN }: {
  open: boolean; onClose: () => void; locationLabel: string
  mode: Mode; setMode: (m: Mode) => void; hideCheck: boolean; setHideCheck: (b: boolean) => void; resultN: number
}) {
  const modes: [Mode, string][] = [["any", "Any"], ["onsite", "On-site"], ["hybrid", "Hybrid"], ["remote", "Remote"]]
  return (
    <BottomSheet open={open} onClose={onClose} label="Filters">
      <div style={{ padding: "0 18px 18px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>Filters</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Location</span>
          <span style={{ height: 28, display: "inline-flex", alignItems: "center", padding: "0 12px", borderRadius: 99, background: "#2a2a28", color: "#c9c9c2", fontSize: 12, fontWeight: 600 }}>{locationLabel ? `${locationLabel} · from profile` : "From profile"}</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Work mode</span>
          <div style={{ display: "flex", background: "#1b1b1a", borderRadius: 10, padding: 2, marginTop: 8 }}>
            {modes.map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{ flex: 1, height: 30, borderRadius: 8, border: "none", background: mode === m ? "#3a3a36" : "transparent", color: mode === m ? "#f2f2ee" : "#8b8b84", fontSize: 12, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", transition: "background 160ms" }}>{label}</button>
            ))}
          </div>
        </div>
        <button onClick={() => setHideCheck(!hideCheck)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 16, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f2f2ee", flex: 1, textAlign: "left" }}>Hide &quot;check details&quot; roles</span>
          <span style={{ width: 40, height: 24, borderRadius: 99, background: hideCheck ? "var(--mm-accent)" : "rgba(255,255,255,0.14)", position: "relative", transition: "background 200ms", flex: "none" }}>
            <span style={{ position: "absolute", top: 2, left: hideCheck ? 18 : 2, width: 20, height: 20, borderRadius: 99, background: "#fff", transition: "left 200ms cubic-bezier(0.32,0.72,0,1)" }} />
          </span>
        </button>
        <button onClick={onClose} className="mm-press" style={{ width: "100%", height: 42, marginTop: 18, borderRadius: 13, border: "none", background: "var(--mm-accent)", color: "var(--mm-accent-fg)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Show {resultN} roles</button>
      </div>
    </BottomSheet>
  )
}

const roundIcon: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 99, border: "none", background: "transparent", color: "#a6a69e",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
}
const ctaBtn: React.CSSProperties = {
  marginTop: 6, height: 36, padding: "0 16px", borderRadius: 99, border: "none", background: "var(--mm-accent)",
  color: "var(--mm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
}
