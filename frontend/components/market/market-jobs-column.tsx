"use client"

import type { Dispatch, SetStateAction } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import type { GlobalJobHit, JobFeedItem, JobPulse, MarketJudgment } from "@/lib/api"
import { MarketJudgmentNote, AspirationRead } from "./market-judgment"
import { ReadMoreJobs } from "./read-more-jobs"
import type { UseFollowCompany } from "@/lib/hooks/use-follow-company"
import { formatCount } from "@/lib/format"
import { AgentPicksBand } from "@/components/jobs/agent-picks-band"
import { openRefreshGate } from "@/store/refreshGateStore"
import { SetupNudge } from "@/components/common/setup-nudge"
import { PasteJobEntry } from "@/components/job-import/paste-job-entry"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { JobCard } from "./job-card"
import { MobileFeed } from "./mobile-feed"
import { FeedControls, FilterChips, LaneChips } from "./feed-filters"
import { useGlobalJobSearch } from "@/lib/hooks/use-global-job-search"
import Link from "next/link"
import { EmptyHandoff, FeedSkeleton, ListEnd, LocationScopePill } from "./jobs-tab-helpers"
import { HiddenJobsDialog } from "./hidden-jobs-dialog"
import { StoryCard, type FeedStory } from "./story-card"
import type { FeedRow } from "./feed-rows"
import type { FeedFilters, FeedLane } from "./feed-types"
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
  openTailor,
  loading,
  judgment,
  warmAccepted,
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
  onReadMore,
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
  openTailor: (j: JobFeedItem, surface: "market" | "agent_pick") => void
  loading: boolean
  judgment: MarketJudgment | null
  /** POST /jobs/feed/warm returned pending. Read lines wait for this. */
  warmAccepted: boolean
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
  /** POST /jobs/feed/read-more, then re-read the list while it reads. */
  onReadMore: () => Promise<void>
}) {
  const router = useRouter()
  const internLane = filters.lane !== "jobs"
  const readingEmpty = !internLane && !loading && Boolean(judgment?.reading) && visibleJobs.length === 0
  const corpus = useGlobalJobSearch(searchOpen ? searchInput : "", { minLength: 2, limit: 8 })
  const showCorpus = searchOpen && q.trim().length >= 2 && visibleJobs.length === 0 && corpus.hits.length > 0

  return (
    <>
      <LaneChips filters={filters} onChange={onChangeFilters} />
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

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <PasteJobEntry token={token} />
        <SetupNudge token={token} style={{ marginTop: 0, flex: 1 }} />
      </div>

      {!readingEmpty && !q && !skillFacet && !filters.roleFamily && filters.lane === "jobs" ? (
        <AgentPicksBand token={token} hasCv={hasCv} context="feed" onSave={onSave} onSkip={onSkip} openTailor={j => openTailor(j, "agent_pick")} />
      ) : null}

      <div style={{ marginTop: 8 }}>
        {loading ? (
          <FeedSkeleton summary />
        ) : readingEmpty ? (
          warmAccepted && judgment ? (
            <>
              <AspirationRead judgment={judgment} />
              <MarketJudgmentNote judgment={judgment} />
            </>
          ) : null
        ) : visibleJobs.length === 0 && showCorpus ? (
          <CorpusHits hits={corpus.hits} loading={corpus.isLoading} />
        ) : visibleJobs.length === 0 && internLane ? (
          <InternLaneEmpty lane={filters.lane} />
        ) : visibleJobs.length === 0 && !judgment?.notice ? (
          <EmptyHandoff savedCount={savedCount} onBuild={() => router.push("/collections")} onClear={clearBrowse} onTellMyro={() => openRefreshGate("say")} />
        ) : (
          <>
            {internLane ? null : <MarketJudgmentNote judgment={judgment} />}
            <div className="tm-feed-summary">
              {/* The number IS the product: out of tens of thousands of live
                  listings, these were chosen for this person. It used to read
                  "1,284 roles" off a sample's `available_total`, which was the
                  size of an arbitrary slice, not of an answer. */}
              {total > 0 ? (
                <span className="tm-feed-summary-count">
                  {formatCount(total)} {filters.lane === "jobs"
                    ? `role${total === 1 ? "" : "s"}, chosen for you`
                    : filters.lane === "hosted"
                      ? `Apply here listing${total === 1 ? "" : "s"}`
                      : `internship${total === 1 ? "" : "s"}`}
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
            {weakShortlist && !internLane && !judgment?.notice ? (
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
                    <JobCard job={row.job} pulse={pulses.get(row.job.job_id)} hasCv={hasCv} onOpen={() => onOpenJob(row.job)} onSave={() => onSave(row.job)} onSkip={() => onSkip(row.job)} onTailor={() => { onSave(row.job); openTailor(row.job, "market") }} />
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
            {/* List Reading (ADR-0027): while the pile is read the loom says how
                far; once the list is full, the person can ask for more. */}
            {internLane ? null : judgment?.reading ? (
              <AspirationRead judgment={judgment} />
            ) : (
              <ReadMoreJobs judgment={judgment} onReadMore={onReadMore} />
            )}
          </>
        )}
      </div>
    </>
  )
}

function InternLaneEmpty({ lane }: { lane: FeedLane }) {
  return (
    <p className="tm-feed-summary" style={{ marginTop: 18 }}>
      {lane === "hosted" ? (
        <>No Apply here listings yet. <Link href="/internships/post">Post a paid internship</Link>.</>
      ) : (
        <>No live internships. <Link href="/internships">Open internships</Link>.</>
      )}
    </p>
  )
}

function CorpusHits({ hits, loading }: { hits: GlobalJobHit[]; loading: boolean }) {
  return (
    <div className="tm-corpus-hits">
      <p className="tm-feed-summary-count">
        {loading ? "Searching all openings" : "From the full corpus"}
      </p>
      <ul>
        {hits.map((hit) => (
          <li key={hit.job_id}>
            <Link href={`/intel?q=${encodeURIComponent(hit.job_title)}`}>
              {hit.job_title}
              {hit.company_name ? ` · ${hit.company_name}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
