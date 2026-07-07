"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { synthMatch } from "@/lib/dashboard/feed-model"
import { BottomSheet } from "./bottom-sheet"
import { JobDetailSheet, type JobDetailData } from "./job-detail-sheet"
import { matchToRow, type MobileJobRow } from "./job-model"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   CollectionsSurface — the handoff Collections tab over REAL saved jobs
   (jobs.applications). Journey strip · source/status filter chips · saved
   cards with a fit ring (joined from jobs.matches, muted when unknown) ·
   Tailor CV / Tailored ✓ · add-job sheet (paste-link → extract → import).
   ══════════════════════════════════════════════════════════════════════════ */

const CIRC = 103.7

type ChipKey = "all" | "found" | "added" | "applied"

function isMyroSource(src: string): boolean {
  const s = src.toLowerCase()
  return s.includes("system") || s.includes("myro") || s.includes("match") || s.includes("feed")
}
function isExtSource(src: string): boolean {
  const s = src.toLowerCase()
  return s.includes("ext") || s.includes("chrome")
}
const isApplied = (a: ApplicationResponse) => a.status !== "saved"

export function CollectionsSurface({ token }: { token: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { snack, closeSnack } = useMobileUI()

  const appsQ = useQuery({ queryKey: dataKeys.applications(), queryFn: () => jobsApi.applications(token), enabled: !!token, staleTime: 60 * 1000 })
  const matchesQ = useQuery({ queryKey: ["jobs", "matches"], queryFn: () => jobsApi.matches(token), enabled: !!token, staleTime: 5 * 60 * 1000 })

  const [chip, setChip] = useState<ChipKey>("all")
  const [addOpen, setAddOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const apps = useMemo(() => appsQ.data ?? [], [appsQ.data])
  const fitMap = useMemo(() => {
    const m = new Map<string, { score: number; verdict: string }>()
    for (const j of matchesQ.data?.jobs ?? []) m.set(j.job_id, { score: j.match_score ?? j.overlap_score ?? 0, verdict: j.verdict })
    return m
  }, [matchesQ.data])

  const counts = useMemo(() => ({
    all: apps.length,
    found: apps.filter(a => isMyroSource(a.source) && !isApplied(a)).length,
    added: apps.filter(a => !isMyroSource(a.source) && !isApplied(a)).length,
    applied: apps.filter(isApplied).length,
  }), [apps])

  const shown = useMemo(() => {
    if (chip === "found") return apps.filter(a => isMyroSource(a.source) && !isApplied(a))
    if (chip === "added") return apps.filter(a => !isMyroSource(a.source) && !isApplied(a))
    if (chip === "applied") return apps.filter(isApplied)
    return apps
  }, [apps, chip])

  const tailoredN = apps.filter(a => a.cv_badge).length

  const detailApp = detailId ? apps.find(a => a.job_id === detailId) ?? null : null

  const remove = useMutation({
    mutationFn: (jobId: string) => jobsApi.removeTrackerJob(token, jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dataKeys.applications() }),
  })
  const doUnsave = (a: ApplicationResponse) => {
    remove.mutate(a.job_id)
    setDetailId(null)
    snack({ msg: "Removed from Collections", action: "Undo", onAction: () => { void jobsApi.saveJob(token, a.job_id).then(() => qc.invalidateQueries({ queryKey: dataKeys.applications() })); closeSnack() } })
  }
  const doShare = (a: ApplicationResponse) => {
    const url = a.source_url ?? ""
    if (url) void navigator.clipboard?.writeText(url).catch(() => {})
    snack({ msg: url ? "Link copied" : "No link on this role" })
  }
  const doRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    void Promise.all([appsQ.refetch(), matchesQ.refetch()]).finally(() => {
      setTimeout(() => { setRefreshing(false); snack({ msg: "Fresh — every link re-verified today" }) }, 600)
    })
  }

  const rowFor = (a: ApplicationResponse): { row: MobileJobRow; fitKnown: boolean } => {
    const base = synthMatch(a)
    const hit = fitMap.get(a.job_id)
    if (hit) { base.match_score = hit.score; base.verdict = hit.verdict as typeof base.verdict }
    return { row: matchToRow(base), fitKnown: !!hit && hit.score > 0 }
  }

  const detailData: JobDetailData | null = detailApp
    ? (() => {
        const { row } = rowFor(detailApp)
        return {
          row,
          whyFit: (detailApp.job_summary ?? detailApp.job_description ?? "").slice(0, 260),
          matched: detailApp.matched_skills ?? [],
          gaps: detailApp.missing_skills ?? [],
          saved: true,
          hasApply: !!detailApp.source_url,
        }
      })()
    : null

  return (
    <div data-screen-label="Collections" className="mm-root" style={{ background: "var(--mm-bg)", minHeight: "100%", animation: "mm-screenIn 240ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "10px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: "-0.03em" }}>Collections</h1>
          <div style={{ flex: 1 }} />
          <button onClick={doRefresh} aria-label="Refresh" style={{ width: 32, height: 32, borderRadius: 99, border: "none", background: "transparent", color: "#a6a69e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", animation: refreshing ? "mm-spin 0.9s linear infinite" : "none" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.6" /><path d="M20 5v6h-6" /></svg>
          </button>
          <button onClick={() => setAddOpen(true)} className="mm-press" style={{ height: 32, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.09)", background: "#212120", color: "#f2f2ee", fontSize: 12.5, fontWeight: 650, cursor: "pointer", fontFamily: "inherit" }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Add job
          </button>
        </div>

        {/* journey strip */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginTop: 10, background: "#212120", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 13, padding: "9px 6px" }}>
          <JourneyStep label="Browse" sub={`${matchesQ.data?.total ?? "—"} live`} onClick={() => router.push("/market")} done />
          <span style={{ alignSelf: "center", color: "#4a4a45", fontSize: 11 }}>›</span>
          <JourneyStep label="Collect" sub={`${counts.all} saved`} done />
          <span style={{ alignSelf: "center", color: "#4a4a45", fontSize: 11 }}>›</span>
          <JourneyStep label="Tailor" sub="the goal" onClick={() => router.push("/cv")} accent={tailoredN} />
        </div>

        {/* filter chips */}
        <div className="mm-scroll" style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
          {([["all", "All"], ["found", "Myro found"], ["added", "You added"], ["applied", "Applied"]] as [ChipKey, string][]).map(([k, label]) => {
            const on = chip === k
            return (
              <button key={k} onClick={() => setChip(k)} style={{ flex: "none", height: 28, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 99, border: `1px solid ${on ? "transparent" : "rgba(255,255,255,0.08)"}`, background: on ? "#3a3a36" : "transparent", color: on ? "#f2f2ee" : "#a6a69e", fontSize: 12, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", transition: "background 160ms" }}>
                {label}<span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.65, fontWeight: 600 }}>{counts[k]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: "2px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.length === 0 && !appsQ.isLoading ? (
          <div style={{ textAlign: "center", padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Nothing here yet</div>
            <div style={{ fontSize: 12.5, color: "#8b8b84", lineHeight: 1.5 }}>Save roles from Jobs, paste a link,<br />or send them from the Chrome extension.</div>
            <button onClick={() => router.push("/market")} className="mm-press" style={ctaBtn}>Browse jobs</button>
          </div>
        ) : (
          shown.map(a => {
            const { row, fitKnown } = rowFor(a)
            const statusChip = isApplied(a) ? "Applied" : isExtSource(a.source) ? "Extension" : !isMyroSource(a.source) ? "You added" : ""
            return (
              <CollectionCard
                key={a.job_id}
                row={row}
                fitKnown={fitKnown}
                statusChip={statusChip}
                tailored={!!a.cv_badge}
                onOpen={() => setDetailId(a.job_id)}
                onHeart={() => doUnsave(a)}
                onShare={() => doShare(a)}
                onTailor={() => router.push(`/cv/tailor?jobId=${encodeURIComponent(a.job_id)}`)}
                onOpenCv={() => router.push("/cv")}
              />
            )
          })
        )}
      </div>

      <JobDetailSheet
        open={!!detailId}
        onClose={() => setDetailId(null)}
        data={detailData}
        onHeart={() => detailApp && doUnsave(detailApp)}
        onSkip={() => detailApp && doUnsave(detailApp)}
        onTailor={() => detailApp && router.push(`/cv/tailor?jobId=${encodeURIComponent(detailApp.job_id)}`)}
        onApply={() => detailApp?.source_url && window.open(detailApp.source_url, "_blank", "noopener")}
        onPractice={() => setDetailId(null)}
      />

      <AddJobSheet open={addOpen} onClose={() => setAddOpen(false)} token={token} onAdded={() => { void qc.invalidateQueries({ queryKey: dataKeys.applications() }); setChip("added") }} snack={snack} closeSnack={closeSnack} onTailor={(jobId) => router.push(`/cv/tailor?jobId=${encodeURIComponent(jobId)}`)} />
    </div>
  )
}

function JourneyStep({ label, sub, onClick, done, accent }: { label: string; sub: string; onClick?: () => void; done?: boolean; accent?: number }) {
  const inner = (
    <>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent != null ? "var(--mm-accent)" : done ? "#c9c9c2" : "#8b8b84", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 14, height: 14, borderRadius: 99, background: accent != null ? "var(--mm-accent-wash)" : "rgba(255,255,255,0.08)", color: accent != null ? "var(--mm-accent)" : "#c9c9c2", fontSize: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", animation: accent != null ? "mm-dotBlink 2.4s infinite" : "none" }}>{accent != null ? accent : "✓"}</span>
        {label}
      </span>
      <span style={{ fontSize: 10.5, color: "#71716a", fontVariantNumeric: "tabular-nums" }}>{sub}</span>
    </>
  )
  const style: React.CSSProperties = { flex: 1, border: "none", background: "transparent", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: 0 }
  return onClick ? <button onClick={onClick} style={style}>{inner}</button> : <div style={style}>{inner}</div>
}

function CollectionCard({ row, fitKnown, statusChip, tailored, onOpen, onHeart, onShare, onTailor, onOpenCv }: {
  row: MobileJobRow; fitKnown: boolean; statusChip: string; tailored: boolean
  onOpen: () => void; onHeart: () => void; onShare: () => void; onTailor: () => void; onOpenCv: () => void
}) {
  return (
    <div onClick={onOpen} style={{ background: "#212120", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 16, padding: "13px 14px 11px", cursor: "pointer", animation: "mm-screenIn 260ms cubic-bezier(0.16,1,0.3,1) both" }}>
      <div style={{ display: "flex", gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: row.logoBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff", flex: "none" }}>{row.coInitial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#c9c9c2", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.co}</span>
            {statusChip && <span style={{ fontSize: 10, fontWeight: 700, color: statusChip === "Applied" ? "var(--mm-accent)" : "#a6a69e", background: statusChip === "Applied" ? "var(--mm-accent-wash)" : "rgba(255,255,255,0.06)", borderRadius: 5, padding: "1.5px 6px", flex: "none" }}>{statusChip}</span>}
            {row.ago && <span style={{ fontSize: 11, color: "#71716a", flex: "none", marginLeft: "auto" }}>{row.ago}</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.28, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{row.role}</div>
          <div style={{ fontSize: 11.5, color: "#8b8b84", marginTop: 3 }}>{row.metaLine}</div>
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 44 }}>
          <div style={{ position: "relative", width: 40, height: 40 }}>
            <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="16.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              {fitKnown && <circle cx="20" cy="20" r="16.5" fill="none" stroke={row.ringColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - row.fit / 100)} transform="rotate(-90 20 20)" />}
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: fitKnown ? "#f2f2ee" : "#71716a" }}>{fitKnown ? row.fit : "—"}</div>
          </div>
          {fitKnown && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: row.ringColor, textTransform: "uppercase", whiteSpace: "nowrap" }}>{row.verdict}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
        <button onClick={(e) => { e.stopPropagation(); onHeart() }} aria-label="Remove from saved" className="mm-press-sm" style={iconBtn}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" color="var(--mm-accent)"><path d="M19 14c1.5-1.5 2-3.2 2-4.6C21 6.4 18.6 4 15.6 4 14.2 4 12.9 4.6 12 5.6 11.1 4.6 9.8 4 8.4 4 5.4 4 3 6.4 3 9.4c0 1.4.5 3.1 2 4.6l7 6.6 7-6.6Z" /></svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onShare() }} aria-label="Share" className="mm-press-sm" style={iconBtn}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4m0 0 4 4m-4-4L8 8" /><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>
        </button>
        <div style={{ flex: 1 }} />
        {tailored ? (
          <button onClick={(e) => { e.stopPropagation(); onOpenCv() }} style={{ height: 32, padding: "0 12px", borderRadius: 99, border: "1px solid rgba(0,245,212,0.35)", background: "var(--mm-accent-wash)", color: "var(--mm-accent)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Tailored ✓</button>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onTailor() }} className="mm-press" style={{ height: 32, padding: "0 14px", borderRadius: 99, border: "none", background: "var(--mm-accent)", color: "var(--mm-accent-fg)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Tailor CV</button>
        )}
      </div>
    </div>
  )
}

function AddJobSheet({ open, onClose, token, onAdded, snack, closeSnack, onTailor }: {
  open: boolean; onClose: () => void; token: string; onAdded: () => void
  snack: (s: { msg: string; action?: string; onAction?: () => void }) => void; closeSnack: () => void; onTailor: (jobId: string) => void
}) {
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const link = url.trim()
    if (!link || busy) return
    setBusy(true)
    try {
      const parsed = await jobsApi.extractUrl(token, link)
      const app = await jobsApi.importJob(token, {
        role_name: parsed.role || "Role from link",
        company_name: parsed.company || null,
        location: parsed.location || null,
        job_description: parsed.job_description || "",
        source_url: link,
        primary_skills: [],
        secondary_skills: [],
        status: "saved",
      })
      setUrl("")
      onClose()
      onAdded()
      snack({ msg: "Added to Collections", action: "Tailor now", onAction: () => { closeSnack(); onTailor(app.job_id) } })
    } catch {
      snack({ msg: "Couldn't read that link — try Upload a JD" })
    } finally {
      setBusy(false)
    }
  }
  return (
    <BottomSheet open={open} onClose={onClose} label="Add job">
      <div style={{ padding: "0 18px 18px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>Add a job</div>
        <div style={{ fontSize: 12, color: "#8b8b84", marginTop: 2 }}>Anything you add lands in Collections, ready to tailor.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a job link…" style={{ flex: 1, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "#1b1b1a", color: "#f2f2ee", padding: "0 12px", fontSize: 13.5, outline: "none", fontFamily: "inherit" }} />
          <button onClick={submit} disabled={busy} className="mm-press" style={{ height: 40, padding: "0 16px", borderRadius: 12, border: "none", background: "var(--mm-accent)", color: "var(--mm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Add"}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", marginTop: 10, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: "#2a2a28", display: "flex", alignItems: "center", justifyContent: "center", color: "#c9c9c2" }}><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.4" /></svg></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 650, color: "#f2f2ee" }}>Chrome extension</span>
            <span style={{ display: "block", fontSize: 11.5, color: "#8b8b84", marginTop: 1 }}>Save from any job board in one tap</span>
          </span>
        </div>
      </div>
    </BottomSheet>
  )
}

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 99, border: "1px solid rgba(255,255,255,0.08)", background: "transparent",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
}
const ctaBtn: React.CSSProperties = {
  marginTop: 6, height: 36, padding: "0 16px", borderRadius: 99, border: "none", background: "var(--mm-accent)",
  color: "var(--mm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
}
