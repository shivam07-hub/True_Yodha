"use client"

import type { Dispatch, SetStateAction } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import type { JobFeedItem, JobPulse, MarketJudgment } from "@/lib/api"
import { MarketJudgmentNote } from "./market-judgment"
import type { UseFollowCompany } from "@/lib/hooks/use-follow-company"
import { formatCount } from "@/lib/format"
import { AgentPicksBand } from "@/components/jobs/agent-picks-band"
import { openRefreshGate } from "@/store/refreshGateStore"
import { SetupNudge } from "@/components/common/setup-nudge"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { JobCard } from "./job-card"
import { MobileFeed } from "./mobile-feed"
import { FeedControls, FilterChips } from "./feed-filters"
import { EmptyHandoff, FeedSkeleton, ListEnd, LocationScopePill } from "./jobs-tab-helpers"
import { HiddenJobsDialog } from "./hidden-jobs-dialog"
import { StoryCard, type FeedStory } from "./story-card"
import type { FeedRow } from "./feed-rows"
import type { FeedFilters } from "./feed-types"
import type { FeedScope } from "@/lib/feed-scope"

export function MarketJobsColumn({
  token,
  hasCv,
  searchOpen,
  setSearchOpen,
  searchInput,
  setSearchInput,
  setQ,
  onQueryChange,
  filters,
  onChangeFilters,
  savedCount,
  shortlistSize,
  onOpenFilters,
  q,
  skillFacet,
  setSkillFacet,
  onSkillFacetChange,
  onSave,
  onSkip,
  loading,
  judgment,
  visibleJobs,
  clearBrowse,
  total,
  scope,
  weakShortlist,
  isDesktop,
  rows,
  pulses,
  followCompany,
  onOpenJob,
  onStoryPrimary,
  onStorySecondary,
}: {
  token: string
  hasCv: boolean
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  searchInput: string
  setSearchInput: Dispatch<SetStateAction<string>>
  setQ: (q: string) => void
  onQueryChange?: (query: string) => void
  filters: FeedFilters
  onChangeFilters: (f: FeedFilters) => void
  savedCount: number
  /** What retrieval capped the list at — the response says so. */
  shortlistSize: number
  onOpenFilters: () => void
  q: string
  skillFacet: string | null
  setSkillFacet: (skill: string | null) => void
  onSkillFacetChange?: (skill: string | null) => void
  onSave: (j: JobFeedItem) => void
  onSkip: (j: JobFeedItem) => void
  loading: boolean
  judgment: MarketJudgment | null
  visibleJobs: JobFeedItem[]
  clearBrowse: () => void
  total: number
  scope: FeedScope
  weakShortlist: boolean
  isDesktop: boolean
  rows: FeedRow[]
  pulses: Map<string, JobPulse>
  followCompany: Pick<UseFollowCompany, "action">
  onOpenJob: (job: JobFeedItem) => void
  onStoryPrimary: (s: FeedStory) => void
  onStorySecondary: (s: FeedStory) => void
}) {
  const router = useRouter()

  return (
    <>
      <div className="tm-feed-bar">
        {searchOpen ? (
          <>
            <input
              autoFocus
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search roles, companies, skills..."
              aria-label="Search jobs"
              className="tm-feed-search"
            />
            <button
              type="button"
              className="tm-feed-iconbtn"
              aria-label="Close search"
              onClick={() => { setSearchInput(""); setQ(""); onQueryChange?.(""); setSearchOpen(false) }}
            >
              <X size={15} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="tm-feed-iconbtn"
              aria-label="Search jobs"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
            </button>
            <FeedControls
              filters={filters}
              savedCount={savedCount}
              onOpenSaved={() => router.push("/collections")}
              onOpenFilters={onOpenFilters}
            />
            <HiddenJobsDialog token={token} />
          </>
        )}
      </div>

      <SetupNudge token={token} style={{ marginTop: 14 }} />

      {!q && !skillFacet && !filters.roleFamily ? (
        <AgentPicksBand token={token} hasCv={hasCv} context="feed" onSave={onSave} onSkip={onSkip} />
      ) : null}

      <div style={{ marginTop: 8 }}>
        {loading ? (
          <FeedSkeleton summary />
        ) : visibleJobs.length === 0 && !judgment?.notice ? (
          <EmptyHandoff savedCount={savedCount} onBuild={() => router.push("/collections")} onClear={clearBrowse} onTellMyro={() => openRefreshGate("say")} />
        ) : (
          <>
            <MarketJudgmentNote judgment={judgment} />
            <div className="tm-feed-summary">
              {/* The number IS the product: out of tens of thousands of live
                  listings, these were chosen for this person. It used to read
                  "1,284 roles" off a sample's `available_total`, which was the
                  size of an arbitrary slice, not of an answer. */}
              {total > 0 ? (
                <span className="tm-feed-summary-count">
                  {formatCount(total)} role{total === 1 ? "" : "s"}, chosen for you
                </span>
              ) : null}
              <LocationScopePill scope={scope} onOpen={onOpenFilters} />
              {skillFacet ? (
                <button
                  type="button"
                  className="tm-feed-activechip"
                  onClick={() => { setSkillFacet(null); onSkillFacetChange?.(null) }}
                  aria-label={`Remove skill: ${skillFacet}`}
                >
                  <span className="tm-feed-chip-label" title={skillFacet}>{skillFacet}</span> <span aria-hidden>x</span>
                </button>
              ) : null}
              {filters.roleFamily ? (
                <button
                  type="button"
                  className="tm-feed-activechip"
                  onClick={() => onChangeFilters({ ...filters, roleFamily: null })}
                  aria-label={`Remove role: ${filters.roleFamily}`}
                >
                  <span className="tm-feed-chip-label" title={filters.roleFamily}>{filters.roleFamily}</span> <span aria-hidden>x</span>
                </button>
              ) : null}
              <FilterChips filters={filters} onChange={onChangeFilters} />
              <button
                type="button"
                className="tm-feed-searchchip"
                onClick={() => openRefreshGate("review")}
                title="Run Myro Search"
                style={{ marginLeft: "auto" }}
              >
                <Search size={13} aria-hidden />
                Myro Search
              </button>
            </div>
            {weakShortlist && !judgment?.notice ? (
              <div className="tm-feed-weak-note">
                <strong>No strong matches yet.</strong> Here are the closest — each card shows what would move it.
              </div>
            ) : null}
            {total > 0 && total < 5 && !judgment?.notice ? (
              <button
                type="button"
                onClick={() => openRefreshGate("say")}
                style={{
                  width: "100%", marginBottom: 12, padding: "11px 14px", textAlign: "left",
                  borderRadius: 12, border: "1px solid var(--tm-int-border)", background: "var(--tm-int-bg-wash)",
                  color: "var(--tm-text)", fontSize: "var(--tm-fs-body)", cursor: "pointer",
                }}
              >
                Only a few matches here. <strong style={{ color: "var(--tm-interactive)" }}>Tell Myro what you actually want →</strong>
              </button>
            ) : null}
            {isDesktop ? (
              <VirtualFeed
                items={rows}
                getKey={row => (row.t === "job" ? row.job.job_id : row.id)}
                estimateSize={180}
                gap={14}
                renderItem={row =>
                  row.t === "divider" ? (
                    <div className="tm-feed-expansion-divider" data-kind={row.kind}>{row.label}</div>
                  ) : row.t === "story" ? (
                    <StoryCard
                      story={row.story}
                      onPrimary={() => onStoryPrimary(row.story)}
                      onSecondary={() => onStorySecondary(row.story)}
                      companyAction={row.story.kind === "company" ? followCompany.action(row.story.company) : undefined}
                    />
                  ) : (
                    <JobCard job={row.job} pulse={pulses.get(row.job.job_id)} hasCv={hasCv} onOpen={() => onOpenJob(row.job)} onSave={() => onSave(row.job)} onSkip={() => onSkip(row.job)} />
                  )
                }
              />
            ) : (
              <MobileFeed
                rows={rows}
                pulses={pulses}
                hasCv={hasCv}
                onOpen={onOpenJob}
                onSave={onSave}
                onSkip={onSkip}
                onStoryPrimary={onStoryPrimary}
                onStorySecondary={onStorySecondary}
                companyAction={followCompany.action}
              />
            )}
            {/* No sentinel and no "End of feed": the list is finite and the user
                can see its end. An infinite scroll that ran out used to need a
                label explaining it had. */}
            <ListEnd shown={visibleJobs.length} of={total} cap={shortlistSize} />
          </>
        )}
      </div>
    </>
  )
}
