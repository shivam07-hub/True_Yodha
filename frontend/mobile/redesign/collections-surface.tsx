"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { CollectionEntry, CollectionStage } from "@/lib/api"
import { SORTS, type SortKey } from "@/lib/dashboard/feed-model"
import { emptyCopy, orderEntries } from "@/lib/collections/model"
import { useCollection, STAGE_CHIPS } from "@/lib/collections/use-collection"
import { useCollectionActions } from "@/lib/collections/use-collection-actions"
import { useMyroSearch } from "@/lib/hooks/use-myro-search"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { BottomSheet } from "./bottom-sheet"
import { JobDetailSheet, type JobDetailData } from "./job-detail-sheet"
import { ApplyCapturePromptMobile } from "./apply-capture-prompt"
import { AddJobSheet } from "./add-job-sheet"
import { CollectionCard, pulseLine } from "./collection-card"
import { MobileAgentPicks } from "./agent-picks-mobile"
import { matchToRow } from "./job-model"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   CollectionsSurface — the mobile Myro Ops folder. ONE read
   (`GET /jobs/collections`), one entry per job, one stage each; the server
   resolves the partition (CONTEXT.md → Collection Record). This file used to
   hold a second, independent copy of that derivation beside the desktop one.
   ══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_DISMISS_KEY = "mm_collections_journey_dismissed_at"
const JOURNEY_RESURFACE_MS = 7 * 24 * 60 * 60 * 1000

export function CollectionsSurface({ token, initialJobId, openSearch }: { token: string; initialJobId?: string | null; openSearch?: boolean }) {
  const router = useRouter()
  const { snack, closeSnack } = useMobileUI()
  const { refreshVm, gate: myroSearchGate, run: runMyroSearch, isRefreshing } = useMyroSearch(token)
  const collection = useCollection(token)
  const actions = useCollectionActions(token)

  const [chosen, setChosen] = useState<CollectionStage | null>(null)
  const stage = chosen ?? collection.landing
  const [sort, setSort] = useState<SortKey>("fit")
  const [sortOpen, setSortOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(initialJobId ?? null)
  const [journeyHidden, setJourneyHidden] = useState(() => {
    if (typeof window === "undefined") return false
    const at = Number(window.localStorage.getItem(JOURNEY_DISMISS_KEY))
    return at > 0 && Date.now() - at < JOURNEY_RESURFACE_MS
  })
  const dismissJourney = () => {
    setJourneyHidden(true)
    try { window.localStorage.setItem(JOURNEY_DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
  }

  const shown = useMemo(() => orderEntries(collection.byStage(stage), sort), [collection, stage, sort])
  // Trust LINE only — the stage itself is server-joined, so a card past the
  // pulse batch's 100-id cap still sits in the right chip.
  const pulses = usePulses(token, useMemo(() => shown.map((e) => e.job_id), [shown]))

  // A deep-linked job must be reachable even when its stage is not the open one.
  useEffect(() => {
    if (!detailId) return
    const entry = collection.byId.get(detailId)
    if (entry && entry.stage !== stage && chosen === null) setChosen(entry.stage)
  }, [detailId, collection, stage, chosen])

  const searchOpened = useRef(false)
  useEffect(() => {
    if (openSearch && !searchOpened.current) { searchOpened.current = true; runMyroSearch() }
  }, [openSearch, runMyroSearch])

  const firedRef = useRef(false)
  useEffect(() => {
    if (refreshVm.state === "done" && (refreshVm.matchesWritten ?? 0) > 0) {
      if (!firedRef.current) { firedRef.current = true; snack({ msg: "Fresh matches ready" }) }
    } else if (refreshVm.state !== "done") {
      firedRef.current = false
    }
  }, [refreshVm.state, refreshVm.matchesWritten, snack])

  useEffect(() => {
    if (!actions.notice) return
    const isUndo = actions.notice.kind === "undo"
    snack({
      msg: isUndo ? "Removed from Collections" : "Couldn’t remove this job",
      action: isUndo ? "Undo" : undefined,
      ms: 6_000,
      onAction: isUndo ? () => { closeSnack(); actions.undo() } : undefined,
    })
  }, [actions, closeSnack, snack])

  const detail = detailId ? collection.byId.get(detailId) ?? null : null
  const applyCapture = useApplyCapture({
    token,
    job: {
      job_id: detail?.job_id ?? "",
      source_url: detail?.job.source_url ?? null,
      company: detail?.job.company ?? null,
      listing_confidence: detail?.liveness === "down" ? "closed" : detail?.liveness === "live" ? "active" : "uncertain",
    },
    surface: "other",
    intentSurface: "mobile_collections",
    onFindSimilar: () => { setDetailId(null); router.push("/market") },
  })

  const doShare = (entry: CollectionEntry) => {
    const url = entry.job.source_url ?? ""
    if (url) void navigator.clipboard?.writeText(url).catch(() => {})
    snack({ msg: url ? "Link copied" : "No link on this role" })
  }

  const detailData: JobDetailData | null = (() => {
    if (!detail) return null
    const row = matchToRow(detail.job)
    const trust = pulseLine(pulses.get(detail.job_id))
    if (trust) { row.verified = trust.text; if (trust.warn) row.checkDetails = true }
    return {
      row,
      whyFit: detail.job.llm_explanation ?? (detail.job.job_summary ?? detail.job.job_description ?? "").slice(0, 260),
      matched: detail.job.matched_skills ?? [],
      gaps: detail.job.missing_skills ?? [],
      saved: detail.stage !== "found",
      canDismiss: detail.stage !== "applied",
      hasApply: detail.liveness !== "down" && !!applyCapture.target.url,
      applyLabel: applyCapture.target.actionLabel ?? undefined,
    }
  })()

  const neverSearched = collection.isEmpty && !isRefreshing

  return (
    <div data-screen-label="Collections" className="mm-root" style={{ background: "var(--mm-bg)", minHeight: "100%", animation: "mm-screenIn 240ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "10px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: "-0.03em" }}>Collections</h1>
          <div style={{ flex: 1 }} />
          {stage !== "found" && (
            <button onClick={() => setSortOpen(true)} aria-label="Sort" style={{ width: 32, height: 32, borderRadius: 99, border: "none", background: "transparent", color: "var(--mm-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></svg>
            </button>
          )}
          <button onClick={() => setAddOpen(true)} className="mm-press" style={{ height: 32, display: "flex", alignItems: "center", gap: 5, padding: "0 11px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.09)", background: "var(--mm-card)", color: "var(--mm-text)", fontSize: 12.5, fontWeight: 650, cursor: "pointer", fontFamily: "inherit" }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Add
          </button>
        </div>

        {/* The journey strip IS the stage ladder now — the same four rungs the
            chips filter on, so the strip can no longer count something the chips
            do not. Tailored is the goal step, so it carries the accent. */}
        {!journeyHidden && (
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginTop: 10, background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 13, padding: "9px 6px" }}>
            <JourneyStep label="Found" sub={`${collection.counts.found}`} onClick={() => setChosen("found")} done />
            <span style={{ alignSelf: "center", color: "var(--mm-stroke)", fontSize: 11 }}>›</span>
            <JourneyStep label="Saved" sub={`${collection.counts.saved}`} onClick={() => setChosen("saved")} done />
            <span style={{ alignSelf: "center", color: "var(--mm-stroke)", fontSize: 11 }}>›</span>
            <JourneyStep label="Tailored" sub="the goal" onClick={() => setChosen("tailored")} accent={collection.counts.tailored} />
            <button onClick={dismissJourney} aria-label="Dismiss" className="tm-dismiss-action" style={{ alignSelf: "flex-start", width: 22, height: 22, marginLeft: 2, flexShrink: 0, borderRadius: 99, border: "none", background: "transparent", color: "var(--mm-dim)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <div className="mm-scroll" style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
          {STAGE_CHIPS.map(({ key, label }) => {
            const on = stage === key
            return (
              <button key={key} onClick={() => setChosen(key)} style={{ flex: "none", height: 28, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 99, border: `1px solid ${on ? "transparent" : "var(--mm-border)"}`, background: on ? "var(--mm-raise-2)" : "transparent", color: on ? "var(--mm-text)" : "var(--mm-muted)", fontSize: 12, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", transition: "background 160ms" }}>
                {label}<span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.65, fontWeight: 600 }}>{collection.counts[key]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: "2px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {stage === "found" ? <MobileAgentPicks token={token} context="collections" /> : null}

        {isRefreshing && stage === "found" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderRadius: 13, border: "1px solid rgba(79,199,246,0.2)", background: "var(--mm-accent-wash)", fontSize: 12.5, color: "var(--mm-text-2)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--mm-accent)", animation: "mm-dotBlink 1.1s infinite", flex: "none" }} />
              {refreshVm.progressLabel ?? "Myro Ops · reading the market"}
              {refreshVm.progressTotal != null && refreshVm.progressDone != null ? ` · ${refreshVm.progressDone}/${refreshVm.progressTotal}` : ""}
            </div>
            {[0, 1, 2].map(i => <div key={i} style={{ height: 86, borderRadius: 16, background: "var(--mm-card)", border: "1px solid var(--mm-hair)", opacity: 0.55 }} />)}
          </>
        ) : shown.length > 0 ? (
          <>
            {stage === "found" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--mm-faint)", textTransform: "uppercase" }}>
                  Cleared the bar · {shown.length}
                </div>
                <button onClick={runMyroSearch} disabled={isRefreshing} className="mm-press" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "0 4px", border: "none", background: "transparent", color: "var(--mm-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: isRefreshing ? 0.6 : 1 }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                  {isRefreshing ? "Searching…" : "Search again"}
                </button>
              </div>
            ) : null}
            {shown.map((entry) => {
              const row = matchToRow(entry.job)
              const trust = pulseLine(pulses.get(entry.job_id))
              if (trust) { row.verified = trust.text; if (trust.warn) row.checkDetails = true }
              return (
                <CollectionCard
                  key={entry.job_id}
                  entry={entry}
                  row={row}
                  fitKnown={(entry.job.match_score ?? 0) > 0}
                  pulse={pulses.get(entry.job_id)}
                  onOpen={() => setDetailId(entry.job_id)}
                  onRemove={() => { actions.remove(entry); setDetailId((c) => (c === entry.job_id ? null : c)) }}
                  onShare={() => doShare(entry)}
                  onAnswerPending={(submitted) => actions.answerPending(entry.job_id, submitted)}
                />
              )
            })}
            {stage === "found" ? (
              <SplitFooter belowBarCount={collection.belowBarCount} rejectedCount={collection.rejectedCount} onBrowseJobs={() => router.push("/market")} />
            ) : null}
          </>
        ) : stage === "found" && neverSearched ? (
          <div style={{ textAlign: "center", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 16 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>Run your first Myro Search</div>
            <div style={{ fontSize: 12.5, color: "var(--mm-faint)", lineHeight: 1.5, maxWidth: "34ch" }}>Myro reads the live market against your CV and fills this folder with the roles that clear its quality bar.</div>
            <button onClick={runMyroSearch} className="mm-press" style={ctaBtn}>Myro Search</button>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12.5, color: "var(--mm-faint)", lineHeight: 1.5 }}>{emptyCopy(stage)}</div>
            {stage === "found" ? (
              <SplitFooter belowBarCount={collection.belowBarCount} rejectedCount={collection.rejectedCount} onBrowseJobs={() => router.push("/market")} />
            ) : stage === "saved" ? (
              <button onClick={() => router.push("/market")} className="mm-press" style={ctaBtn}>Browse jobs</button>
            ) : null}
          </div>
        )}
      </div>

      <JobDetailSheet
        open={!!detailId}
        onClose={() => setDetailId(null)}
        data={detailData}
        token={token}
        onSkip={() => { if (detail) { actions.remove(detail); setDetailId(null) } }}
        onTailor={() => { if (detail) router.push(`/cv?jobId=${encodeURIComponent(detail.job_id)}`) }}
        onApply={() => { if (applyCapture.target.url) applyCapture.open() }}
        captureSlot={detail ? <ApplyCapturePromptMobile capture={applyCapture} /> : null}
      />

      <AddJobSheet open={addOpen} onClose={() => setAddOpen(false)} token={token} onAdded={() => { void collection.query.refetch(); setChosen("saved") }} snack={snack} closeSnack={closeSnack} onTailor={(jobId) => router.push(`/cv?jobId=${encodeURIComponent(jobId)}`)} />

      {myroSearchGate}

      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} label="Sort">
        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>Sort by</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            {SORTS.map(s => (
              <button key={s.key} onClick={() => { setSort(s.key); setSortOpen(false) }} className="mm-press-sm" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", background: "none", border: "none", borderBottom: "1px solid var(--mm-hair)", color: sort === s.key ? "var(--mm-accent)" : "var(--mm-text)", fontSize: 14, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ flex: 1 }}>{s.label}</span>
                {sort === s.key && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

function SplitFooter({ belowBarCount, rejectedCount, onBrowseJobs }: { belowBarCount: number; rejectedCount: number; onBrowseJobs: () => void }) {
  if (belowBarCount === 0 && rejectedCount === 0) return null
  return (
    <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--mm-hair)", display: "flex", flexDirection: "column", gap: 7 }}>
      {belowBarCount > 0 ? (
        <div style={{ fontSize: 12, color: "var(--mm-faint)", lineHeight: 1.5 }}>
          {belowBarCount} more ranked below the bar —{" "}
          <button onClick={onBrowseJobs} style={{ background: "none", border: "none", padding: 0, color: "var(--mm-accent)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>see them in Jobs →</button>
        </div>
      ) : null}
      {rejectedCount > 0 ? (
        <div style={{ fontSize: 12, color: "var(--mm-dim)", lineHeight: 1.5 }}>{rejectedCount} rejected — dead listing, wrong level, or off your deal-breakers.</div>
      ) : null}
    </div>
  )
}

function JourneyStep({ label, sub, onClick, done, accent }: { label: string; sub: string; onClick?: () => void; done?: boolean; accent?: number }) {
  const inner = (
    <>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent != null ? "var(--mm-accent)" : done ? "var(--mm-text-3)" : "var(--mm-faint)", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 14, height: 14, borderRadius: 99, background: accent != null ? "var(--mm-accent-wash)" : "var(--mm-border)", color: accent != null ? "var(--mm-accent)" : "var(--mm-text-3)", fontSize: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", animation: accent != null ? "mm-dotBlink 2.4s infinite" : "none" }}>{accent != null ? accent : "✓"}</span>
        {label}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--mm-dim)", fontVariantNumeric: "tabular-nums" }}>{sub}</span>
    </>
  )
  const style: React.CSSProperties = { flex: 1, border: "none", background: "transparent", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: 0 }
  return onClick ? <button onClick={onClick} style={style}>{inner}</button> : <div style={style}>{inner}</div>
}

const ctaBtn: React.CSSProperties = {
  marginTop: 6, height: 36, padding: "0 16px", borderRadius: 99, border: "none", background: "var(--mm-accent)",
  color: "var(--mm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
}
