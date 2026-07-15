"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { Badge } from "@/components/ui/badge"
import { attentionCount } from "@/components/preparations/prep-model"
import type { NavItem } from "@/lib/nav-items"
import type { NavUnlocksVm } from "@/lib/hooks/use-nav-unlocks"

function AttentionBadge() {
  // "Rooms needing you" (Preparations grill Q8): overdue stage-checks +
  // follow-ups due, computed from the shared applications cache — the pill
  // finally counts something the click resolves.
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const n = attentionCount(data ?? [], new Date())
  if (n === 0) return null
  return (
    <Badge variant="neutral" style={{ marginLeft: 4, fontFamily: "var(--tm-font-mono)" }}>
      {n > 9 ? "9+" : n}
    </Badge>
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

  // Split the merged CV workspace into two sibling tabs — CV and Preparations.
  // Preparations (2026-07-15 grill) is the post-apply prep surface at its own
  // route; the old /cv?view=active Applications tab redirects there. renderKey
  // disambiguates the two cv slots; the coachmark and NEW pill stay on the
  // primary (CV) slot only so they don't fire twice.
  type RenderItem = NavItem & { renderKey: string }
  const items = nav.visibleDesktop.reduce<RenderItem[]>((acc, item) => {
    if (item.id !== "cv") return [...acc, { ...item, renderKey: item.id }]
    return [
      ...acc,
      { ...item, renderKey: "cv", href: "/cv?view=cv", label: "CV", stalePill: false },
      { ...item, renderKey: "preparations", href: "/preparations", label: "Preparations", stalePill: true },
    ]
  }, [])

  return (
    <>
      {activeCoachId && <div className="tm-nav-scrim" onClick={nav.ackCoach} aria-hidden />}
      <nav className="tm-topbar-nav" aria-label="Primary navigation">
        {items.map((item) => {
          const active = item.renderKey === "cv"
            ? pathname === "/cv"
            : item.renderKey === "preparations"
              ? pathname.startsWith("/preparations")
              : pathname.startsWith(item.href)
          const isPrimarySlot = item.id !== "cv" || item.renderKey === "cv"
          const isTarget = activeCoachId === item.id && isPrimarySlot
          const isNew = nav.newItems.has(item.id) && isPrimarySlot
          return (
            <div key={item.renderKey} className={`tm-nav-slot${isTarget ? " tm-nav-slot--target" : ""}`}>
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
                {item.stalePill && <AttentionBadge />}
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
      {nav.content.map((item) => {
        const isNew = nav.newItems.has(item.id)
        return (
          <Link
            key={item.id}
            href={item.href}
            title={item.desc}
            className={`tm-topbar-link ${item.special ? "tm-topbar-link-myrology" : "tm-topbar-link-content"}`}
            data-active={pathname.startsWith(item.href)}
            onClick={() => { if (isNew) nav.clearNew(item.id) }}
          >
            {item.special ? `✦ ${item.label}` : item.label}
            {isNew && <span className="tm-nav-new">NEW</span>}
          </Link>
        )
      })}
    </div>
  )
}
