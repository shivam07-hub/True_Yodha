"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import "@/components/dashboard/dashboard.css"
import "@/app/(authed)/home/mission-control.css"
import "./collections.css"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { AgentPicksBand } from "@/components/jobs/agent-picks-band"
import { MatchVettingBanner } from "@/components/jobs/matches-refresh-banner"
import { useMyroSearch } from "@/lib/hooks/use-myro-search"
import { useParticleMoment } from "@/components/particle"
import { SortMenu } from "@/components/dashboard/sort-menu"
import { PeekSurfaces } from "@/components/mission-control/peek-surfaces"
import { FirstSuccessChecklist } from "@/components/onboarding/first-success-checklist"
import { useManualAdd, ADD_JOB_LABEL } from "@/components/cv/pipeline/useManualAdd"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useCollection, STAGE_CHIPS } from "@/lib/collections/use-collection"
import { useCollectionActions } from "@/lib/collections/use-collection-actions"
import { emptyCopy, orderEntries } from "@/lib/collections/model"
import type { SortKey } from "@/lib/dashboard/feed-model"
import type { CollectionEntry, CollectionStage } from "@/lib/api"
import { CollectionRow } from "./collection-rows"

/* ══════════════════════════════════════════════════════════════════════════
   The Myro Ops folder (desktop). ONE read (`GET /jobs/collections`), one entry
   per job, one stage each — the server resolves the partition and this renders
   it (CONTEXT.md → Collection Record). It used to union the match stack and the
   applications list here, in parallel with a second copy in the mobile skin,
   off three caches; that is how one job came to sit in two chips.
   ══════════════════════════════════════════════════════════════════════════ */

export function CollectionsDesktop({
  token,
  initialJobId,
  openSearch,
}: {
  token: string
  initialJobId?: string | null
  openSearch?: boolean
}) {
  const router = useRouter()
  const { refreshVm, gate: myroSearchGate, run: runMyroSearch, isRefreshing } = useMyroSearch(token)
  const fireMoment = useParticleMoment()
  const collection = useCollection(token)
  const actions = useCollectionActions(token)

  // The landing rule: open on the first stage that still needs the user
  // (CONTEXT.md). Both halves are null until the record lands — `collection.landing`
  // used to fall back to "found", so the page opened on a guess and then moved
  // the active chip under the user (found → applied on a real board).
  const [chosen, setChosen] = React.useState<CollectionStage | null>(null)
  const stage = chosen ?? collection.landing
  const [sort, setSort] = React.useState<SortKey>("fit")
  const [openId, setOpenId] = React.useState<string | null>(initialJobId ?? null)

  const addJob = useManualAdd({
    token,
    onSaved: () => {
      void collection.query.refetch()
      setChosen("saved")
    },
  })

  const shown = React.useMemo(
    () => (stage ? orderEntries(collection.byStage(stage), sort) : []),
    [collection, stage, sort],
  )
  // The trust LINE only — liveness itself is server-joined now, so a card that
  // scrolls past the pulse batch's cap still lands in the right stage.
  const pulses = usePulses(token, React.useMemo(() => shown.map((e) => e.job_id), [shown]))

  // A deep-linked job must be reachable even when its stage is not the open one,
  // or a bell prompt looks like it did nothing.
  React.useEffect(() => {
    if (!openId) return
    const entry = collection.byId.get(openId)
    if (entry && entry.stage !== stage && chosen === null) setChosen(entry.stage)
  }, [openId, collection, stage, chosen])

  const searchOpened = React.useRef(false)
  React.useEffect(() => {
    if (openSearch && !searchOpened.current) {
      searchOpened.current = true
      runMyroSearch()
    }
  }, [openSearch, runMyroSearch])

  const firedRef = React.useRef(false)
  React.useEffect(() => {
    if (refreshVm.state === "done" && (refreshVm.matchesWritten ?? 0) > 0) {
      if (!firedRef.current) { firedRef.current = true; fireMoment({ intensity: 1.4 }) }
    } else {
      firedRef.current = false
    }
  }, [refreshVm.state, refreshVm.matchesWritten, fireMoment])

  // One wiring for every row on this surface — the pinned picks and the list
  // are the same card doing the same things.
  const rowActions = (entry: CollectionEntry) => ({
    onOpen: () => setOpenId(openId === entry.job_id ? null : entry.job_id),
    onRemove: () => actions.remove(entry),
    onSaveNote: (note: string) => actions.saveNote(entry.job_id, note),
    onAnswerPending: (submitted: boolean) => actions.answerPending(entry.job_id, submitted),
  })

  const neverSearched = collection.isEmpty && !isRefreshing

  return (
    <div className="tm-intel-page" style={{ padding: "32px 36px 64px", maxWidth: 1480, margin: "0 auto" }}>
      <div className="mc-workspace">
        <aside className="mc-ws-rail mc-ws-rail--peek">
          <FirstSuccessChecklist token={token} />
          <div className="mc-rail">
            <PeekSurfaces token={token} />
          </div>
        </aside>

        <div className="mc-ws-main">
          <div className="db">
            <div className="db-head">
              <div className="db-segments" role="tablist" aria-label="Filter the folder">
                {STAGE_CHIPS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="tab"
                    aria-selected={stage === c.key}
                    className={`db-seg tm-control-focus${stage === c.key ? " active" : ""}`}
                    onClick={() => setChosen(c.key)}
                  >
                    {c.label}
                    {/* Count-less until the record lands. A 0 here is a claim
                        about the user's board, and it was wrong for ~1s on every
                        load: 0 0 0 0 0 → 14 75 9 22 5. */}
                    {collection.counts ? (
                      <span className="db-seg-count">{collection.counts[c.key]}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="db-head-actions">
                {stage !== "found" ? <SortMenu sort={sort} onChange={setSort} /> : null}
                {stage === "found" ? (
                  <button
                    type="button"
                    className="db-btn db-btn-secondary tm-control-focus"
                    onClick={runMyroSearch}
                    disabled={isRefreshing}
                  >
                    <Search size={14} aria-hidden style={{ marginRight: 6, verticalAlign: "-2px" }} />
                    {isRefreshing ? "Searching…" : "Search again"}
                  </button>
                ) : null}
                <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={addJob.open}>
                  + {ADD_JOB_LABEL}
                </button>
              </div>
            </div>

            <MatchVettingBanner token={token} health={collection.query.data?.match_health} />

            {/* Picks inherit THIS surface's card, not the market one: inside the
                Ops folder the job is already collected, so Save is not the hero
                — it would sit beside Tailor CV as a peer for the same decision.
                Why opens on a pick: the reason Myro chose it IS the band. */}
            {stage === "found" ? (
              <AgentPicksBand
                token={token}
                context="collections"
                renderCard={(pick) => {
                  const entry = collection.byId.get(pick.job_id)
                  // A pick the record does not hold (dismissed since, or below
                  // the bar) is dropped rather than rendered from the pick row —
                  // that would be a second card shape for one job.
                  if (!entry) return null
                  return (
                    <CollectionRow
                      entry={entry}
                      token={token}
                      open={openId === entry.job_id}
                      openWhy
                      pulse={pulses.get(entry.job_id)}
                      actions={rowActions(entry)}
                    />
                  )
                }}
              />
            ) : null}

            {collection.isLoading ? (
              /* The record has not arrived. Nothing below this point may speak
                 about the user's board yet — the empty state used to render
                 "Nothing has cleared the bar yet", a verdict about the market,
                 while the request was still in flight. */
              <div className="db-feed" aria-busy="true" aria-live="polite">
                <span className="tm-sr-only">Loading your collection…</span>
                <div className="mf-skel" />
                <div className="mf-skel" />
                <div className="mf-skel" />
              </div>
            ) : isRefreshing && stage === "found" ? (
              <>
                <div className="mf-reading" role="status" aria-live="polite">
                  <span className="mf-reading-dot" aria-hidden />
                  <span>
                    {refreshVm.progressLabel ?? "Myro Ops · reading the market"}
                    {refreshVm.progressTotal != null && refreshVm.progressDone != null
                      ? ` · ranked ${refreshVm.progressDone}/${refreshVm.progressTotal}`
                      : ""}
                  </span>
                </div>
                <div className="mf-skel" />
                <div className="mf-skel" />
                <div className="mf-skel" />
              </>
            ) : shown.length > 0 ? (
              <>
                <VirtualFeed
                  items={shown}
                  getKey={(e) => e.job_id}
                  estimateSize={190}
                  gap={14}
                  className="db-feed"
                  renderItem={(entry) => (
                    <CollectionRow
                      entry={entry}
                      token={token}
                      open={openId === entry.job_id}
                      pulse={pulses.get(entry.job_id)}
                      actions={rowActions(entry)}
                    />
                  )}
                />
                {stage === "found" ? (
                  <SplitFooter
                    belowBarCount={collection.belowBarCount}
                    rejectedCount={collection.rejectedCount}
                    onBrowseJobs={() => router.push("/market")}
                  />
                ) : null}
              </>
            ) : stage === "found" && neverSearched ? (
              <div className="mf-firstrun">
                <div className="mf-firstrun-title">Run your first Myro Search</div>
                <p className="mf-firstrun-sub">
                  Myro reads the live market against your CV and fills this folder with the roles that clear its quality bar.
                </p>
                <button type="button" className="db-btn db-btn-primary tm-control-focus" onClick={runMyroSearch}>
                  <Search size={14} aria-hidden style={{ marginRight: 6 }} /> Myro Search
                </button>
              </div>
            ) : (
              <div className="db-empty" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
                <span>{stage ? emptyCopy(stage) : null}</span>
                {stage === "found" ? (
                  <SplitFooter
                    belowBarCount={collection.belowBarCount}
                    rejectedCount={collection.rejectedCount}
                    onBrowseJobs={() => router.push("/market")}
                  />
                ) : stage === "saved" ? (
                  <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={() => router.push("/market")}>
                    Browse jobs
                  </button>
                ) : null}
              </div>
            )}

            {addJob.modal}
            {myroSearchGate}

            {actions.notice && typeof document !== "undefined"
              ? createPortal(
                  <div className="db db-undo-toast" role="status" aria-live="polite">
                    <span>{actions.notice.kind === "undo" ? "Removed from Collections" : "Couldn’t remove this job"}</span>
                    {actions.notice.kind === "undo" ? (
                      <button type="button" onClick={actions.undo}>Undo</button>
                    ) : (
                      <button type="button" onClick={actions.clearNotice}>Dismiss</button>
                    )}
                  </div>,
                  document.body,
                )
              : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function SplitFooter({
  belowBarCount,
  rejectedCount,
  onBrowseJobs,
}: {
  belowBarCount: number
  rejectedCount: number
  onBrowseJobs: () => void
}) {
  if (belowBarCount === 0 && rejectedCount === 0) return null
  return (
    <div className="mf-footer">
      {belowBarCount > 0 ? (
        <p className="mf-footer-line">
          {belowBarCount} more ranked below the bar —{" "}
          <button type="button" className="mf-footer-link" onClick={onBrowseJobs}>
            see them in Jobs, best first →
          </button>
        </p>
      ) : null}
      {rejectedCount > 0 ? (
        <p className="mf-footer-line">
          {rejectedCount} rejected — dead listing, wrong level, or off your deal-breakers.
        </p>
      ) : null}
    </div>
  )
}
