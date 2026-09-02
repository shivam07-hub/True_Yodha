"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { notifications as notificationsApi, type NotificationItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { formatRelativeAge } from "@/lib/format"
import { openRefreshGate } from "@/store/refreshGateStore"
import "./notification-bell.css"

/* One inbox for durable product events: fresh matches, CV analysis, new
   inventory.

   The saved-role decision group is gone. It projected `collection_attention`,
   an age-based nag that escalated every saved role to `urgent` simply for
   ageing — 251 of 331 rows sat at the top rung — and across 326 sends it
   produced 0 tailors, 0 applies and 0 removals. "What do I do now" already has
   one ranked answer in the Next chip (`deriveNextAction`), rendered where the
   user is looking. Retired rows are still in the table until they are deleted,
   so they stay filtered out below. */

const UNREAD_POLL_MS = 60_000

export function NotificationBell() {
  const { token } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const inbox = useQuery({
    queryKey: dataKeys.notifications(),
    queryFn: () => notificationsApi.list(token!),
    enabled: !!token && open,
    refetchInterval: open ? UNREAD_POLL_MS : false,
    staleTime: 30_000,
  })
  // The inbox contract already carries unread_count. A second request for the
  // same badge on every open doubled the J2 work and amplified DB contention.
  const unreadCount = inbox.data?.unread_count ?? 0

  const items = useMemo(() => inbox.data?.items ?? [], [inbox.data])

  // Saved-role prompts still awaiting a decision (unread === unresolved), minus
  // any we've just acted on optimistically this session.
  // New inventory Myro ingested that this user has never searched. Pinned above
  // everything and carrying its own action, because it is the one row where the
  // next step is a single click and the payoff is the whole product.
  const newInventory = useMemo(
    () => items.find((n) => n.kind === "new_jobs" && n.read_at === null) ?? null,
    [items],
  )
  const others = useMemo(
    // `collection_attention` is retired; prod still holds 326 of those rows
    // until they are deleted, and a retired prompt must never resurface.
    () => items.filter((n) => n.kind !== "collection_attention" && n.id !== newInventory?.id),
    [items, newInventory],
  )

  /** Run the search the announcement is about. The gate lives on /market, so
   *  off-market we hand off through the URL and /market opens it on arrival. */
  const runSearch = () => {
    setOpen(false)
    if (newInventory && newInventory.read_at === null) {
      void notificationsApi.markRead(token!, [newInventory.id]).then(invalidateInbox)
    }
    if (window.location.pathname === "/market") openRefreshGate()
    else router.push("/market?search=1")
  }

  const invalidateInbox = () => {
    void qc.invalidateQueries({ queryKey: dataKeys.notificationsUnread() })
    void qc.invalidateQueries({ queryKey: dataKeys.notifications() })
    void qc.invalidateQueries({ queryKey: dataKeys.applications() })
  }

  const onRowClick = (n: NotificationItem) => {
    if (n.read_at === null) {
      void notificationsApi.markRead(token!, [n.id]).then(() => {
        void qc.invalidateQueries({ queryKey: dataKeys.notificationsUnread() })
        void qc.invalidateQueries({ queryKey: dataKeys.notifications() })
      })
    }
    setOpen(false)
    if (n.action_url) {
      router.push(n.action_url)
      return
    }
    if (n.kind === "fresh_matches") {
      router.push(n.job_id ? `/collections?jobId=${encodeURIComponent(n.job_id)}` : "/market")
    } else if (n.kind === "cv_analysis") {
      router.push("/cv")
    } else if (n.kind === "new_jobs") {
      router.push("/market?search=1")
    }
  }

  if (!token) return null

  const hasContent = others.length > 0

  return (
    <div className="tm-bell" ref={panelRef}>
      <button
        type="button"
        className="tm-bell-btn"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="tm-bell-badge" aria-hidden>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <>
          <div className="tm-bell-scrim" onClick={() => setOpen(false)} aria-hidden />
          <div className="tm-bell-panel" role="dialog" aria-label="Notifications">
            <div className="tm-bell-head">Notifications</div>

            {inbox.isLoading ? (
              <div className="tm-bell-empty">Loading…</div>
            ) : !hasContent ? (
              <div className="tm-bell-empty">
                <span className="tm-bell-empty-title">You’re all caught up</span>
                <span className="tm-bell-empty-sub">CV results and fresh job matches will appear here.</span>
              </div>
            ) : (
              <ul className="tm-bell-list">
                {newInventory && (
                  <li className="tm-bell-newjobs">
                    <span className="tm-bell-newjobs-title">{newInventory.title}</span>
                    {newInventory.body && (
                      <span className="tm-bell-newjobs-body">{newInventory.body}</span>
                    )}
                    <button type="button" className="tm-bell-act is-primary" onClick={runSearch}>
                      Run Myro Search · Free
                    </button>
                  </li>
                )}
                {others.map((n) => {
                  const isUnread = n.read_at === null
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`tm-bell-row${isUnread ? " is-unread" : ""}`}
                        onClick={() => onRowClick(n)}
                      >
                        <span className="tm-bell-dot" aria-hidden data-on={isUnread} />
                        <span className="tm-bell-rowbody">
                          <span className="tm-bell-rowtitle">{n.title}</span>
                          {n.body && <span className="tm-bell-rowmatch">{n.body}</span>}
                          {n.kind === "cv_analysis" && n.state === "processing" && (
                            <span className="tm-bell-rowstate">In progress</span>
                          )}
                          <span className="tm-bell-rowtime">{relTime(n.created_at)}</span>
                        </span>
                        <span className="tm-bell-go" aria-hidden>→</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? "" : formatRelativeAge(t)
}

function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}
