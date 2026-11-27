"use client"

/**
 * The reviewer desk for Human Checks (#56 S4). Behind the one admin token
 * (`X-Myro-Admin-Token`), kept in this tab's session only. Three lists: the
 * queue by due time, calls still open (every check ends in one, ENG5), and
 * payments whose grant never finished.
 */

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { CheckPanel } from "@/components/review/check-panel"
import { Button } from "@/components/ui/button"
import { reviewer, type ReviewerCheck } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import "./checks-desk.css"

const TOKEN_KEY = "myro-reviewer-token"

const SHORT_KIND: Record<"cv_job" | "linkedin" | "search", string> = {
  cv_job: "CV",
  linkedin: "LinkedIn",
  search: "Search call",
}

function readToken(): string {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? ""
  } catch {
    return ""
  }
}

function saveToken(token: string) {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* private mode: the token lives in memory for this visit */
  }
}

function CallRow({ adminToken, check, onDone }: { adminToken: string; check: ReviewerCheck; onDone: () => void }) {
  const [busy, setBusy] = useState<"yes" | "no" | null>(null)
  async function close(pasted: boolean) {
    setBusy(pasted ? "yes" : "no")
    try {
      await reviewer.closeCall(adminToken, check.id, pasted)
      onDone()
    } finally {
      setBusy(null)
    }
  }
  const digits = (check.contact_whatsapp ?? "").replace(/\D/g, "")
  const linkedin = check.kind === "linkedin"
  return (
    <li className="rv-row">
      <span className="rv-row-main">
        {SHORT_KIND[check.kind ?? "cv_job"]} · {check.buyer_email ?? check.user_id}
      </span>
      {digits ? (
        <a className="tm-link" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
      ) : check.buyer_email ? (
        <a className="tm-link" href={`mailto:${check.buyer_email}`}>No number · email</a>
      ) : (
        <span className="rv-meta">No number yet</span>
      )}
      {linkedin ? (
        <>
          <Button size="sm" onClick={() => close(true)} loading={busy === "yes"}>{busy === "yes" ? "Saving…" : "Pasted"}</Button>
          <Button size="sm" variant="outline" onClick={() => close(false)} loading={busy === "no"}>
            {busy === "no" ? "Saving…" : "Not pasted"}
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={() => close(false)} loading={busy === "no"}>{busy === "no" ? "Saving…" : "Call done"}</Button>
      )}
    </li>
  )
}

export function ChecksDesk() {
  const queryClient = useQueryClient()
  const [adminToken, setAdminToken] = useState("")
  const [draftToken, setDraftToken] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    setAdminToken(readToken())
    // The queued-check email links /admin/checks?id=<check>.
    setOpenId(new URLSearchParams(window.location.search).get("id"))
  }, [])

  const queueQ = useQuery({
    queryKey: ["reviewer", "queue", adminToken],
    queryFn: () => reviewer.queue(adminToken),
    enabled: adminToken !== "",
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reviewer"] })

  if (!adminToken) {
    return (
      <main className="rv-desk">
        <h1>Human checks</h1>
        <form
          className="rv-token"
          onSubmit={(e) => {
            e.preventDefault()
            saveToken(draftToken.trim())
            setAdminToken(draftToken.trim())
          }}
        >
          <label className="rv-field">
            <span>Reviewer token</span>
            <input className="tm-input" type="password" value={draftToken} onChange={(e) => setDraftToken(e.target.value)} />
          </label>
          <Button type="submit">Open the desk</Button>
        </form>
      </main>
    )
  }

  const data = queueQ.data
  const open = data?.checks.find((c) => c.id === openId) ?? null
  const now = Date.now()

  return (
    <main className="rv-desk">
      <header className="rv-desk-head">
        <h1>Human checks</h1>
        {data ? <span className="rv-meta">{data.checks.length} open · {data.calls.length} calls</span> : null}
      </header>
      {queueQ.isError ? <p className="rv-error">{(queueQ.error as Error).message}</p> : null}

      <div className="rv-cols">
        <section aria-label="Queue">
          <h2 className="rv-h">Queue</h2>
          <ul className="rv-list">
            {(data?.checks ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="rv-row rv-row-button"
                  data-open={c.id === openId || undefined}
                  onClick={() => setOpenId(c.id)}
                >
                  <span className="rv-row-main">{SHORT_KIND[c.kind ?? "cv_job"]} · {c.buyer_email ?? c.user_id}</span>
                  <span className={c.due_at && Date.parse(c.due_at) < now ? "rv-late" : "rv-meta"}>
                    {c.status === "in_review" ? "In review · " : ""}due {formatDateTime(c.due_at ?? "")}
                  </span>
                </button>
              </li>
            ))}
            {data && data.checks.length === 0 ? <li className="rv-meta">Nothing waiting.</li> : null}
          </ul>

          {data && data.calls.length > 0 ? (
            <>
              <h2 className="rv-h">Calls</h2>
              <ul className="rv-list">
                {data.calls.map((c) => <CallRow key={c.id} adminToken={adminToken} check={c} onDone={refresh} />)}
              </ul>
            </>
          ) : null}

          {data && data.stuck_payments.length > 0 ? (
            <>
              <h2 className="rv-h">Stuck payments</h2>
              <ul className="rv-list">
                {data.stuck_payments.map((p) => (
                  <li key={p.id} className="rv-row">
                    <span className="rv-row-main">{p.product} · paid {formatDateTime(p.verified_at)}</span>
                    <Button size="sm" variant="outline" onClick={async () => { await reviewer.retrySettle(adminToken, p.id); refresh() }}>
                      Retry
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {open ? <CheckPanel adminToken={adminToken} check={open} onChanged={refresh} /> : null}
      </div>
    </main>
  )
}
