"use client"

import { WaveBg, SegmentedSteps } from "./MissionHeaderParts"

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

const IconRefresh = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8a6 6 0 0 1 10.5-3.9" /><path d="M14 2v3h-3" />
    <path d="M14 8a6 6 0 0 1-10.5 3.9" /><path d="M2 14v-3h3" />
  </svg>
)
const IconDiary = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <rect x="3" y="2.5" width="10" height="11" rx="1.5" /><path d="M5 5.5h6M5 8h6M5 10.5h4" />
  </svg>
)
const IconArrowUR = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 11L11 5" /><path d="M5.5 5h5.5v5.5" />
  </svg>
)
const IconAsterisk = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--tm-accent)" strokeWidth="1.6" strokeLinecap="round">
    <path d="M12 3v18" /><path d="M3 12h18" /><path d="M5.6 5.6l12.8 12.8" /><path d="M18.4 5.6L5.6 18.4" />
  </svg>
)
const IconTrophy = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="var(--tm-accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3h6v3a3 3 0 0 1-6 0z" /><path d="M5 4H3v1.5A1.5 1.5 0 0 0 4.5 7H5" />
    <path d="M11 4h2v1.5A1.5 1.5 0 0 1 11.5 7H11" /><path d="M6.5 9h3v2h-3z" /><path d="M5 13h6" />
  </svg>
)
const IconFlame = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="var(--tm-warning)" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M8 14c-2.5 0-4.5-1.8-4.5-4.2 0-2 1.5-3 1.5-4.5 0 1 .8 1.7 1.7 1.7 0-2.5 1.3-4 3.3-5 0 2 1 2.7 1.5 4 .5 1.2 1 2 1 3.8C12.5 12.2 10.5 14 8 14z" />
  </svg>
)

const GHOST_BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  height: 34, padding: "0 14px", borderRadius: 999,
  background: "transparent", border: "1px solid var(--tm-border-soft)",
  color: "var(--tm-text-muted)", fontSize: 13, fontWeight: 500,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  transition: "border-color 200ms, color 200ms",
}

export interface MissionHeaderProps {
  targetRoles: string
  targetLoc: string
  firstName: string | null
  streak: number
  sessions: number
  score: number
  evidenceData: { score_delta: number | null; diary_entries_count: number; evidence_count: number } | null
  hasCv: boolean
  hasJob: boolean
  loggedToday: boolean
  hasApplied: boolean
  isRefreshing: boolean
  refreshNotice: string | null
  cartCount: number
  onRefreshMatches: () => void
  onEnterForge: () => void
  onOpenDiary: () => void
}

export function MissionHeader({
  targetRoles, targetLoc, firstName,
  streak, sessions, score, evidenceData,
  hasCv, hasJob, loggedToday, hasApplied,
  isRefreshing, refreshNotice, cartCount,
  onRefreshMatches, onEnterForge, onOpenDiary,
}: MissionHeaderProps) {
  const dayStr = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()
  const scoreDelta = evidenceData?.score_delta != null ? Math.max(0, Math.round(evidenceData.score_delta)) : null
  const diaryCount = evidenceData?.diary_entries_count ?? 0
  const displayName = firstName ?? "there"

  const onGhostEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
    e.currentTarget.style.color = "var(--tm-accent)"
  }
  const onGhostLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.borderColor = "var(--tm-border-soft)"
    e.currentTarget.style.color = "var(--tm-text-muted)"
  }

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--tm-radius-lg)", marginBottom: 18, minHeight: 380 }}>
      {/* Background grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(var(--tm-accent-grid,rgba(0,245,212,0.025)) 1px, transparent 1px), linear-gradient(90deg, var(--tm-accent-grid,rgba(0,245,212,0.025)) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(ellipse 80% 70% at 50% 30%, black 30%, transparent 80%)",
      }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <WaveBg score={score} />
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 80% at 30% 50%, transparent 30%, var(--tm-bg) 90%)" }} />

      <div style={{ position: "relative", zIndex: 1, padding: "28px 36px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontFamily: "var(--tm-font-mono)", fontSize: 12, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-accent)", fontWeight: 500 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--tm-accent)", boxShadow: "0 0 0 4px var(--tm-accent-wash)", flexShrink: 0, display: "inline-block" }} />
            <span>Target:</span>
            <span style={{ color: "var(--tm-text-muted)" }}>{targetRoles}</span>
            {targetLoc && <><span style={{ opacity: 0.4 }}>·</span><span style={{ color: "var(--tm-text-muted)" }}>{targetLoc}</span></>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={GHOST_BTN} onClick={onRefreshMatches} disabled={isRefreshing} onMouseEnter={onGhostEnter} onMouseLeave={onGhostLeave}>
              <IconRefresh />{isRefreshing ? "Refreshing…" : "Refresh matches"}
            </button>
            <button style={GHOST_BTN} onClick={onOpenDiary} onMouseEnter={onGhostEnter} onMouseLeave={onGhostLeave}>
              <IconDiary />Diary + cart
              {cartCount > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, borderRadius: 99, padding: "0 5px", background: "var(--tm-accent)", color: "var(--tm-accent-fg)", fontSize: 10, fontWeight: 700 }}>
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, alignItems: "center" }}>

          {/* Left */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontFamily: "var(--tm-font-display)", fontWeight: 400, fontSize: 58, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--tm-text)" }}>
                {greeting()},
              </h1>
              <h1 style={{ margin: 0, fontFamily: "var(--tm-font-display)", fontWeight: 400, fontStyle: "italic", fontSize: 58, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--tm-accent)" }}>
                {displayName}
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--tm-font-mono)", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", fontWeight: 500 }}>
              <IconAsterisk />
              <span style={{ color: "var(--tm-text)" }}>Mission Control</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{dayStr}</span>
              {sessions > 0 && <><span style={{ opacity: 0.4 }}>·</span><span>{sessions} active targets</span></>}
            </div>
            <SegmentedSteps hasCv={hasCv} hasJob={hasJob} loggedToday={loggedToday} hasApplied={hasApplied} />
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 4 }}>
              <button
                onClick={onEnterForge}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 48, padding: "0 22px", borderRadius: 999, background: "var(--tm-accent)", border: "none", color: "var(--tm-accent-fg)", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "box-shadow 200ms" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 0 6px var(--tm-accent-wash), 0 0 28px var(--tm-accent-glow)" }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none" }}
              >
                Enter Forge <IconArrowUR />
              </button>
              <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 13, color: "var(--tm-text-muted)" }}>+75 XP for completing Forge</span>
            </div>
            {refreshNotice && <div style={{ fontSize: 12, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)" }}>{refreshNotice}</div>}
          </div>

          {/* Right */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              <IconTrophy />Score · last {sessions} sessions
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 88, lineHeight: 0.9, fontWeight: 500, color: "var(--tm-accent)", letterSpacing: "-0.02em", textShadow: "0 0 32px var(--tm-accent-glow)" }}>
                {Math.round(score)}
              </span>
              <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 22, color: "var(--tm-text-faint)" }}>/100</span>
            </div>
            {scoreDelta != null && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", color: "var(--tm-success)", fontSize: 13, fontFamily: "var(--tm-font-mono)", fontWeight: 600 }}>
                +{scoreDelta} since last CV ↑
              </div>
            )}
            {/* Streak / Sessions card */}
            <div style={{ display: "flex", alignItems: "stretch", borderRadius: 14, border: "1px solid var(--tm-border-soft)", background: "color-mix(in srgb, var(--tm-surface) 80%, transparent)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", overflow: "hidden" }}>
              <div style={{ padding: "12px 22px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                  <IconFlame />Streak
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 34, lineHeight: 1, fontWeight: 500, color: "var(--tm-text)" }}>{streak}</span>
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 13, color: "var(--tm-text-faint)" }}>d</span>
                </div>
              </div>
              <div style={{ width: 1, background: "var(--tm-border-soft)" }} />
              <div style={{ padding: "12px 22px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--tm-accent)", display: "inline-block" }} />Sessions
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 34, lineHeight: 1, fontWeight: 500, color: "var(--tm-text)" }}>{sessions}</span>
                  {evidenceData?.evidence_count ? <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 13, color: "var(--tm-text-faint)" }}>· {evidenceData.evidence_count}d</span> : null}
                </div>
              </div>
            </div>
            {diaryCount > 0 && (
              <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                {diaryCount} diary {diaryCount === 1 ? "entry" : "entries"} logged
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
