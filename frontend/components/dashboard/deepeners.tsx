"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useStreamingText } from "@/lib/hooks/use-streaming-text"
import { useXPGate } from "@/lib/hooks/use-xp-gate"
import { useXPStore } from "@/store/xpStore"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

const DEEPEN_COST = 5

/** Frontend labels for the backend's fixed prompt keys (jobs/deepen.py). */
export const DEEPEN_PROMPTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "lift_fit", label: "What would lift my fit?" },
  { key: "funnel", label: "How's their interview funnel?" },
  { key: "compare", label: "Compare me to a typical hire" },
]

export function Deepeners({ jobId, token, active }: { jobId: string; token: string; active: boolean }) {
  const stream = useStreamingText()
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const gate = useXPGate({ cost: DEEPEN_COST, action: "deepen_job" })
  const [openKey, setOpenKey] = React.useState<string | null>(null)

  // Already-purchased answers + whether the account has used its one free sample.
  const { data } = useQuery({
    queryKey: dataKeys.deepenings(jobId),
    queryFn: () => jobsApi.deepenings(token, jobId),
    enabled: !!token && active,
    staleTime: 5 * 60 * 1000,
  })
  const cached = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const it of data?.items ?? []) m.set(it.prompt_key, it.answer)
    return m
  }, [data])
  const firstFree = data ? !data.sampled : false

  const ask = React.useCallback(
    (key: string) => {
      setOpenKey(key)
      const hit = cached.get(key)
      if (hit !== undefined) {
        // Replay from cache — backend charges nothing, no stream needed.
        stream.reset()
        return
      }
      stream.start(jobsApi.deepenStreamPath(jobId, key), token, (ev) => {
        const bal = typeof ev.new_xp_balance === "number" ? ev.new_xp_balance : null
        if (bal != null) applyXpChange({ newBalance: bal, action: "deepen_job" })
      })
    },
    [cached, stream, jobId, token, applyXpChange],
  )

  return (
    <div className="db-deepen">
      <div className="db-lens-h">Dig deeper</div>
      <div className="db-deepen-list">
        {DEEPEN_PROMPTS.map((p) => {
          const isOpen = openKey === p.key
          const hit = cached.get(p.key)
          const showAnswer = isOpen && (hit !== undefined || stream.status !== "idle")
          const free = firstFree && cached.size === 0
          return (
            <div key={p.key} className={`db-deepen-item${isOpen ? " open" : ""}`}>
              <button
                type="button"
                className="db-deepen-q"
                onClick={() => {
                  if (isOpen) { setOpenKey(null); return }
                  if (hit !== undefined) { ask(p.key); return }
                  gate.attempt(() => ask(p.key))
                }}
              >
                <span>{p.label}</span>
                {hit !== undefined ? (
                  <span className="db-deepen-tag">↺</span>
                ) : (
                  <span className="db-deepen-tag cost">{free ? "free" : `${DEEPEN_COST} tokens`}</span>
                )}
              </button>
              {showAnswer ? (
                <div className="db-deepen-a">
                  {hit !== undefined ? hit : stream.text}
                  {hit === undefined && stream.typing ? <span className="db-caret" aria-hidden /> : null}
                  {hit === undefined && stream.status === "error" ? (
                    <span className="db-deepen-err"> · couldn&rsquo;t load</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
