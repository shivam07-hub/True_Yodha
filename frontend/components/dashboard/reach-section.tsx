"use client"

/**
 * ReachSection — the "Reach the people" step of a job's plan (backlog #35, L3).
 *
 * Free tier (ADR-0018): the roles to search for + LinkedIn/Google searches the
 * user opens in their OWN browser. Myro constructs the query and never fetches
 * the result. Paid tier (50 coins): the outreach drafted in the user's voice
 * from their CV + a referral-ask + timing — replayed free once purchased.
 */

import * as React from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { jobs as jobsApi, type JobMatch, type ReachPack } from "@/lib/api"
import { useCoinsGate } from "@/lib/hooks/use-xp-gate"
import { useXPStore } from "@/store/xpStore"

const PACK_COST = 50

function CopyRow({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = React.useState(false)
  if (!text) return null
  return (
    <div className="db-reach-copy">
      <div className="db-reach-copy-head">
        <span className="db-label">{label}</span>
        <button
          type="button"
          className="db-mini-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(text)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="db-reach-copy-body">{text}</p>
    </div>
  )
}

function PackView({ pack }: { pack: ReachPack }) {
  return (
    <div className="db-reach-pack">
      <CopyRow label="Connection note" text={pack.outreach_message} />
      <CopyRow label="Referral ask" text={pack.referral_ask} />
      {pack.warm_intro ? <CopyRow label="Warm intro" text={pack.warm_intro} /> : null}
      {pack.timing ? <p className="db-reach-timing">⏱ {pack.timing}</p> : null}
    </div>
  )
}

export function ReachSection({ job, token, active }: { job: JobMatch; token: string; active: boolean }) {
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const gate = useCoinsGate({ cost: PACK_COST, action: "reach_pack" })

  // Free searches — deterministic + cheap, so fetch as soon as the detail opens.
  const search = useQuery({
    queryKey: ["reach-search", job.job_id],
    queryFn: () =>
      jobsApi.reachSearch(token, {
        job_title: job.title,
        company: job.company,
        job_description: job.job_description ?? "",
      }),
    enabled: !!token && !!job.job_id && active,
    staleTime: 30 * 60 * 1000,
  })

  // Purchased-state (no charge) so we show "view" vs "get · 50".
  const packState = useQuery({
    queryKey: ["reach-pack", job.job_id],
    queryFn: () => jobsApi.getReachPack(token, job.job_id),
    enabled: !!token && !!job.job_id && active,
    staleTime: 5 * 60 * 1000,
  })

  const buy = useMutation({
    mutationFn: () => jobsApi.createReachPack(token, job.job_id),
    onSuccess: (res) => {
      if (typeof res.new_coin_balance === "number") {
        applyXpChange({ newBalance: res.new_coin_balance, action: "reach_pack" })
      }
      packState.refetch()
    },
  })

  const searches = React.useMemo(() => {
    const s = search.data
    if (!s) return []
    return [s.primary, ...s.alternates].filter(Boolean) as NonNullable<typeof s.primary>[]
  }, [search.data])

  const pack = packState.data?.pack ?? buy.data?.pack ?? null
  const purchased = !!pack

  return (
    <div className="db-dsec">
      <div className="db-dsec-head">
        <span className="db-label">Reach the people</span>
      </div>

      {/* Free searches — opened in the user's own browser. */}
      {search.isLoading ? (
        <p className="db-lens-empty">Finding who to reach…</p>
      ) : searches.length > 0 ? (
        <div className="db-reach-searches">
          {searches.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="db-reach-search">
              <span>{s.label}</span>
              <span className="db-reach-kind">{s.kind === "google" ? "web" : "in"}↗</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="db-lens-empty">Add a role or company to find people to reach.</p>
      )}

      {/* Paid outreach pack. */}
      {purchased && pack ? (
        <PackView pack={pack} />
      ) : (
        <div className="db-reach-buy">
          <p className="db-reach-buy-copy">
            Get the outreach drafted in your voice, a referral ask, and when to send it.
          </p>
          <button
            type="button"
            className="db-lockbtn"
            disabled={buy.isPending}
            onClick={() => gate.attempt(() => buy.mutate())}
          >
            {buy.isPending ? "Drafting…" : `Get the outreach plan · ${PACK_COST}`}
          </button>
          {buy.isError ? (
            <p className="db-reach-err">Couldn’t build the plan right now — try again.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
