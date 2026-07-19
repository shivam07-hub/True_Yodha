"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { notifications as notificationsApi, type NotificationItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { formatRelativeAge } from "@/lib/format"
import "./notification-bell.css"

/* One inbox for durable product events: fresh matches and CV analysis. */

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

  const items = inbox.data?.items ?? []

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
                <span className="tm-bell-empty-sub">CV results and fresh job matches will appear here.</span>
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
