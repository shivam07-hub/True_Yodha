"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { notifications as notificationsApi, type NotificationItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { formatRelativeAge } from "@/lib/format"
import "./notification-bell.css"

/* ══════════════════════════════════════════════════════════════════════════
   Notification bell (Backlog #36 Slice 2). The ping CARRIES the match: every
   row is a real fresh-match line (company · role + count), so opening the bell
   is the reward, not a "go check" nudge (N1, Kunal lens). Badge is neutral —
   this app already rejects alarmist-red nav badges. Fits the existing account-
   menu chrome; no new visual identity.
   ══════════════════════════════════════════════════════════════════════════ */

const UNREAD_POLL_MS = 60_000

export function NotificationBell() {
  const { token } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const unread = useQuery({
    queryKey: dataKeys.notificationsUnread(),
    queryFn: () => notificationsApi.unreadCount(token!),
    enabled: !!token,
    refetchInterval: UNREAD_POLL_MS,
    staleTime: UNREAD_POLL_MS,
  })
  const unreadCount = unread.data?.count ?? 0

  const inbox = useQuery({
    queryKey: dataKeys.notifications(),
    queryFn: () => notificationsApi.list(token!),
    enabled: !!token && open,
    staleTime: 30_000,
  })

  // Opening the bell is an implicit "seen" — mark all read + zero the badge, and
  // reconcile the poll. Optimistic so the count clears the instant it opens.
  useEffect(() => {
    if (!open || !token) return
    if (unreadCount === 0) return
    void notificationsApi.markRead(token).then(() => {
      qc.setQueryData(dataKeys.notificationsUnread(), { count: 0 })
      void qc.invalidateQueries({ queryKey: dataKeys.notifications() })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const items = inbox.data?.items ?? []

  const onRowClick = (n: NotificationItem) => {
    setOpen(false)
    // The ping is a shortcut to the match — land where they can act on it.
    if (n.kind === "fresh_matches") {
      router.push(n.job_id ? `/collections?jobId=${encodeURIComponent(n.job_id)}` : "/market")
    }
  }

  if (!token) return null

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
            ) : items.length === 0 ? (
              <div className="tm-bell-empty">
                <span className="tm-bell-empty-title">You’re all caught up</span>
                <span className="tm-bell-empty-sub">We’ll ping you the moment fresh roles match your profile.</span>
              </div>
            ) : (
              <ul className="tm-bell-list">
                {items.map((n) => {
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
