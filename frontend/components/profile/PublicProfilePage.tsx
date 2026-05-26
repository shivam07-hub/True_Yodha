"use client"

import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

import { profile as profileApi, users as usersApi, type PublicProfile, type UserSkillsByDomain } from "@/lib/api"
import { getAccessToken } from "@/lib/session"
import { ScoreRing } from "@/components/skills/score-ring"

import { GhostRadar } from "./GhostRadar"
import { OwnerRadar } from "./OwnerRadar"
import { RadarOverlay } from "./RadarOverlay"
import { JobOverlapRows } from "./JobOverlapRows"
import { ShareButton } from "./ShareButton"

export interface PublicProfilePageProps {
  initial: PublicProfile
  shareUrl: string
}

/**
 * Public profile client surface.
 *
 * Renders ninja's radar always. Right-side compositing depends on viewer:
 *   - logged-out → GhostRadar (conversion CTA)
 *   - logged-in with own scores → RadarOverlay (accountability)
 *   - logged-in without scores → GhostRadar fallback
 *
 * Job overlap fetches only when logged in AND not the owner.
 */
export function PublicProfilePage({ initial, shareUrl }: PublicProfilePageProps) {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    setToken(getAccessToken())
  }, [])

  const ownerDomains = useMemo(() => sortedDomains(initial.domain_scores), [initial.domain_scores])

  const meQuery = useQuery({
    queryKey: ["me", token],
    queryFn: () => usersApi.me(token ?? ""),
    enabled: !!token,
    staleTime: 5 * 60_000,
  })
  const mySkillsQuery = useQuery({
    queryKey: ["me-skills", token],
    queryFn: () => usersApi.mySkills(token ?? ""),
    enabled: !!token,
    staleTime: 5 * 60_000,
  })

  const isOwnerView = !!meQuery.data?.ninja_name && meQuery.data.ninja_name === initial.ninja_name
  const overlapQuery = useQuery({
    queryKey: ["profile-overlap", initial.ninja_name, token],
    queryFn: () => profileApi.overlap(initial.ninja_name, token ?? ""),
    enabled: !!token && !isOwnerView,
    staleTime: 60_000,
  })

  const viewerScores = useMemo(
    () => skillsToDomainScores(mySkillsQuery.data),
    [mySkillsQuery.data],
  )

  const showGhost = !token || !viewerScores || Object.keys(viewerScores).length === 0

  const score = initial.mirror_score ?? 0
  const tier = initial.tier_label ?? ""

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "48px 24px 64px",
        color: "var(--tm-text)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--tm-text-faint)",
            }}
          >
            Myro · Domain Map
          </p>
          <h1
            style={{
              margin: "4px 0 0",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            {initial.ninja_name}
          </h1>
        </div>
        <ShareButton url={shareUrl} ninjaName={initial.ninja_name} score={initial.mirror_score != null ? Math.round(initial.mirror_score) : null} />
      </header>

      <section
        className="tm-profile-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
          alignItems: "start",
        }}
      >
        <figure
          style={{
            margin: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            padding: 20,
            border: "1px solid var(--tm-border)",
            borderRadius: 16,
            background: "var(--tm-surface-2)",
          }}
        >
          <OwnerRadar domains={ownerDomains} scores={initial.domain_scores} />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ScoreRing score={Math.round(score)} />
            {tier ? (
              <span style={{ fontSize: 12, color: "var(--tm-text-faint)", letterSpacing: "0.04em" }}>{tier}</span>
            ) : null}
          </div>
          <CountersStrip
            forge={initial.forge_sessions_count}
            diary={initial.diary_count}
            tracker={initial.tracker_count}
          />
        </figure>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            border: "1px solid var(--tm-border)",
            borderRadius: 16,
            background: "var(--tm-surface-2)",
            minHeight: 320,
          }}
        >
          {showGhost ? (
            <GhostRadar domains={ownerDomains} refNinjaName={initial.ninja_name} />
          ) : (
            <RadarOverlay
              domains={ownerDomains}
              ownerScores={initial.domain_scores}
              viewerScores={viewerScores}
              ownerLabel={initial.ninja_name}
              viewerLabel={meQuery.data?.ninja_name ?? "You"}
            />
          )}
        </div>
      </section>

      <JobOverlapRows rows={overlapQuery.data?.rows ?? []} />

      <style jsx>{`
        @media (max-width: 768px) {
          .tm-profile-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </main>
  )
}

function CountersStrip({ forge, diary, tracker }: { forge: number; diary: number; tracker: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        fontSize: 11,
        color: "var(--tm-text-faint)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      <Counter value={forge} label="Practice" />
      <Counter value={diary} label="Diary" />
      <Counter value={tracker} label="Tracker" />
    </div>
  )
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <strong style={{ color: "var(--tm-text)", fontVariantNumeric: "tabular-nums" }}>{value}</strong>
      {label}
    </span>
  )
}

function sortedDomains(scores: Record<string, number> | null | undefined): string[] {
  if (!scores) return []
  return Object.keys(scores).sort()
}

function skillsToDomainScores(skills: UserSkillsByDomain | undefined): Record<string, number> | null {
  if (!skills) return null
  const out: Record<string, number> = {}
  for (const [domain, items] of Object.entries(skills.by_domain)) {
    if (!items.length) {
      out[domain] = 0
      continue
    }
    const avg = items.reduce((s, it) => s + it.level, 0) / items.length / 5
    out[domain] = avg
  }
  return out
}
