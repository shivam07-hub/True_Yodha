"use client"

/**
 * ReachSection — the "Reach the people" step of a job's plan (backlog #35, L3).
 *
 * Free tier (ADR-0018): the roles to search for + LinkedIn/Google searches the
 * user opens in their OWN browser. Myro constructs the query and never fetches
 * the result. Paid tier (50 coins): the outreach drafted in the user's voice
 * from their CV + a referral-ask + timing — replayed free once purchased. A
 * pack the POST stopped waiting for is waited on, never re-run (`lib/run-wait.ts`).
 */

import * as React from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { jobs as jobsApi, type ReachPack } from "@/lib/api"
import { serverMessage } from "@/lib/api-error"
import { ReachLog } from "@/components/reach/reach-log"
import { useRunWait } from "@/lib/hooks/use-run-wait"
import { useCoinsGate } from "@/lib/hooks/use-xp-gate"
import { purchaseWaitVerdict, runOutcomeUnseen } from "@/lib/run-wait"
import { useXPStore } from "@/store/xpStore"

const PACK_COST = 50

/** Structural subset — JobMatch satisfies it, and so does an ApplicationResponse
 *  mapped by the Preparations room. Only what reach actually reads: the search
 *  reads the job by id server-side, the log labels it by company. */
export interface ReachJobRef {
  job_id: string
  company: string | null
}

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

export function ReachSection({ job, token, active }: { job: ReachJobRef; token: string; active: boolean }) {
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const gate = useCoinsGate({ cost: PACK_COST, action: "reach_pack" })

  // Free searches — deterministic + cheap, so fetch as soon as the detail opens.
  const search = useQuery({
    queryKey: ["reach-search", job.job_id],
    queryFn: () => jobsApi.reachSearch(token, job.job_id),
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

  const [failed, setFailed] = React.useState<string | null>(null)
  const waitFailed = React.useCallback(() => setFailed("Couldn’t build the plan right now — try again."), [])
  const wait = useRunWait({
    token, jobId: job.job_id, entry: "reach-pack", action: "reach_pack",
    read: () => jobsApi.getReachPack(token, job.job_id),
    verdict: purchaseWaitVerdict,
    onFailed: waitFailed,
  })
  const startWait = wait.start
  // A run already working when the section opens (a reload, a second tab).
  const buildingNow = Boolean(packState.data?.building)
  React.useEffect(() => {
    if (buildingNow && !wait.waiting) startWait()
  }, [buildingNow, wait.waiting, startWait])

  const buy = useMutation({
    mutationFn: () => jobsApi.createReachPack(token, job.job_id),
    onMutate: () => setFailed(null),
    onSuccess: (res) => {
      if (typeof res.new_coin_balance === "number") {
        applyXpChange({ newBalance: res.new_coin_balance, action: "reach_pack" })
      }
      packState.refetch()
    },
    onError: (e: Error) => {
      // A timeout is not a failure: the server may still be drafting, and a
      // Retry then would pay for a second run. Read the pack instead.
      if (runOutcomeUnseen(e)) startWait()
      else setFailed(serverMessage(e, "Couldn’t build the plan right now — try again."))
    },
  })
  const drafting = buy.isPending || wait.waiting

  const searches = React.useMemo(() => {
    const s = search.data
    if (!s) return []
    return [s.primary, ...s.alternates].filter(Boolean) as NonNullable<typeof s.primary>[]
  }, [search.data])

  // Own-connections (ADR-0018 Path 1) — optional warm-intro source, uploaded once.
  const conns = useQuery({
    queryKey: ["connections-status"],
    queryFn: () => jobsApi.connectionsStatus(token),
    enabled: !!token && active,
    staleTime: 10 * 60 * 1000,
  })
  const fileRef = React.useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => jobsApi.uploadConnections(token, file),
    onSuccess: () => conns.refetch(),
  })
  const connCount = conns.data?.count ?? 0

  const pack = packState.data?.pack ?? buy.data?.pack ?? null
  const purchased = !!pack

  // No searches and nothing purchased: still show the send ledger. Path 3 is
  // the user logging a person they found, which does not need a search URL.
  if (!search.isLoading && searches.length === 0 && !purchased) {
    return (
      <div className="db-dsec">
        <div className="db-dsec-head">
          <span className="db-label">Reach the people</span>
        </div>
        <ReachLog token={token} jobId={job.job_id} company={job.company} />
      </div>
    )
  }

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
      ) : null}

      {/* Optional own-connections: warm intros at the company (ADR-0018 Path 1). */}
      <div className="db-reach-conn">
        {connCount > 0 ? (
          <span className="db-reach-conn-on">✓ {connCount} connections — warm intros on</span>
        ) : (
          <>
            <button
              type="button"
              className="db-mini-btn"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? "Reading…" : "Add connections for warm intros"}
            </button>
            <span className="db-reach-conn-note">
              Upload your own LinkedIn connections export — used only to find who you already know here.
            </span>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload.mutate(f)
            e.target.value = ""
          }}
        />
        {upload.isError ? <span className="db-reach-err">Couldn’t read that file — use your Connections.csv.</span> : null}
      </div>

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
            disabled={drafting}
            onClick={() => gate.attempt(() => buy.mutate())}
          >
            {drafting ? "Drafting…" : `Get the outreach plan · ${PACK_COST}`}
          </button>
          {failed ? <p className="db-reach-err">{failed}</p> : null}
        </div>
      )}

      <ReachLog token={token} jobId={job.job_id} company={job.company} />
    </div>
  )
}
