"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import type { NavItem } from "@/lib/nav-items"
import type { NavUnlocksVm } from "@/lib/hooks/use-nav-unlocks"

function StaleBadge() {
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey: dataKeys.staleApplications(),
    queryFn: () => jobsApi.staleApplications(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const n = data?.length ?? 0
  if (n === 0) return null
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 14, height: 14, borderRadius: 99, padding: "0 4px",
        background: "var(--tm-text-muted)", color: "var(--tm-surface)",
        fontSize: 9, fontFamily: "var(--tm-font-mono)", marginLeft: 4,
      }}
    >
      {n > 9 ? "9+" : n}
    </span>
  )
}

function ApertureIcon({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }}>
      <path d="M12 2.5C12 2.5 13.1 9.1 15.5 11.5C17.9 13.9 21.5 12 21.5 12C21.5 12 17.9 10.1 15.5 12.5C13.1 14.9 12 21.5 12 21.5C12 21.5 10.9 14.9 8.5 12.5C6.1 10.1 2.5 12 2.5 12C2.5 12 6.1 13.9 8.5 11.5C10.9 9.1 12 2.5 12 2.5Z" />
    </svg>
  )
}

function Coachmark({ item, onAck }: { item: NavItem; onAck: () => void }) {
  if (!item.coach) return null
  const align = item.surfaces.length && item.stage === "gated" ? "right" : "left"
  return (
    <div className={`tm-coach tm-coach--${align}`} role="dialog" aria-label={`${item.label} unlocked`}>
      <span className="tm-coach-caret" aria-hidden />
      <div className="tm-coach-tag">{item.coach.tag}</div>
      <div className="tm-coach-title">{item.label}</div>
      <p className="tm-coach-body">{item.coach.body}</p>
      <div className="tm-coach-foot">
        <button type="button" className="tm-coach-btn" onClick={onAck}>Got it</button>
      </div>
    </div>
  )
}

export function TopbarNav({ nav }: { nav: NavUnlocksVm }) {
  const pathname = usePathname()
  const activeCoachId = nav.activeCoach?.id ?? null

  return (
    <>
      {activeCoachId && <div className="tm-nav-scrim" onClick={nav.ackCoach} aria-hidden />}
      <nav className="tm-topbar-nav" aria-label="Primary navigation">
        {nav.visibleDesktop.map((item) => {
          const active = pathname.startsWith(item.href)
          const isTarget = activeCoachId === item.id
          const isNew = nav.newItems.has(item.id)
          return (
            <div key={item.id} className={`tm-nav-slot${isTarget ? " tm-nav-slot--target" : ""}`}>
              <Link
                href={item.href}
                title={item.desc}
                className={`tm-topbar-link${item.special ? " tm-topbar-link-myrology" : ""}`}
                data-active={active}
                onClick={() => { if (isNew) nav.clearNew(item.id) }}
              >
                {item.id === "home" && <ApertureIcon active={active} />}
                {item.id === "market" && <span className="tm-nav-live-dot" aria-hidden />}
                {item.special ? `✦ ${item.label}` : item.label}
                {item.stalePill && <StaleBadge />}
                {isNew && <span className="tm-nav-new">NEW</span>}
              </Link>
              {isTarget && nav.activeCoach && <Coachmark item={nav.activeCoach} onAck={nav.ackCoach} />}
            </div>
          )
        })}
      </nav>
    </>
  )
}

/**
 * Shared-content cluster (intel-authed grill Q11–13) — Intel / Newsletter persist
 * across login as a secondary, lighter-weight group. Rendered in the header right
 * of the logo (between the brand and the centered workspace tabs). Desktop-only
 * (CSS); on mobile they live in the account menu. The hairline divider sets them
 * apart from the brand.
 */
export function NavContentCluster({ nav }: { nav: NavUnlocksVm }) {
  const pathname = usePathname()
  if (nav.content.length === 0) return null
  return (
    <div className="tm-nav-content-cluster" aria-label="Browse">
      {nav.content.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          title={item.desc}
          className="tm-topbar-link tm-topbar-link-content"
          data-active={pathname.startsWith(item.href)}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}
