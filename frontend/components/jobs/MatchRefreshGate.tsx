"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { jobs, users, type IntentFilterDiff, type RefreshPreflightResponse, type UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatCount } from "@/lib/format"
import { MYRO_COINS_POLICY } from "@/lib/xp-policy"
import { useCoinsGate } from "@/lib/hooks/use-xp-gate"
import { useXPStore } from "@/store/xpStore"
import { useRefreshGateStore } from "@/store/refreshGateStore"
import { MyroChat } from "@/components/myro/myro-chat"
import { TargetingSentence } from "@/components/jobs/targeting-sentence"
import "@/components/jobs/targeting-sentence.css"

/**
 * MatchRefreshGate — the consent + targeting-review gate for "Refresh matches".
 *
 * Design record (grilled 2026-05-30; Targeting Brief 2026-07-07):
 *  - Persists edits to the CANONICAL profile (single source of truth).
 *  - Seeds from GET /jobs/refresh/preflight (the Targeting Brief): empty
 *    fields arrive silently prefilled from user_memory; prefill lives in the
 *    DRAFT and persists only through the user's Run/Save action. Role chips
 *    are human TITLES — the backend derives the matcher's cluster union.
 *  - The order the agent will run is shown as ONE SENTENCE whose nouns are its
 *    controls (see targeting-sentence.tsx). It replaced six numbered form rows,
 *    which made the thing being confirmed the smallest text on the screen. The
 *    CV and the memory count sit under it as sources, not settings.
 *  - Price is SERVER-decided (`preflight.run_cost`, 2026-07-28): free when Myro
 *    landed roles this user has never been matched against — they didn't ask for
 *    that inventory, so they don't pay to look at it — and the flat
 *    MATCH_RUN_COST when they're asking for another pass. The client constant is
 *    a pre-load placeholder only; quoting it as truth is how a "free" promise and
 *    a 100-coin debit end up on the same screen.
 *  - Three exits: Run (save+spend) / Save targeting only / Discard.
 *  - Broke: gate opens, edits stay free, Run disabled + shortfall + /xp link
 *    (reuses the canonical "See how tokens works →" route, not a new earn path).
 *  - Reuses useCoinsGate (policy/telemetry) + the JobMatchDetail dialog pattern.
 *
 * EXTRACTABLE CORE: everything below the manifest rows (ConsentReadout + the
 * three-exit footer + broke state) is action-agnostic. When a SECOND
 * rich-consent agent action appears (e.g. CV upload), lift that into a generic
 * <AgentRunGate manifest=… action=…/> and keep this as a thin caller.
 */

const COST = MYRO_COINS_POLICY.matchRefreshCost

type GateProfile = Pick<
  UserProfile,
  | "target_roles"
  | "target_role_titles"
  | "target_location"
  | "deal_breakers"
  | "career_goal"
  | "superpower"
  | "cv_url"
  | "cv_readiness"
>

interface Draft {
  roles: string[]
  location: string
  dealBreakers: string[]
  /** What the user is drawn TO. No profile column — authored `preference`
   *  facts — so it seeds from the preflight manifest and saves through the
   *  same profile write, which routes it to the one lean writer. */
  lean: string[]
  careerGoal: string
  superpower: string
}

interface MatchRefreshGateProps {
  token: string | null
  profile?: GateProfile | null
  /** Fired after edits persist + tokens consent passes. Hands off to useJobRefresh. */
  onRun: () => void
}

const MAX_CHIPS = 6

function seed(p?: GateProfile | null): Draft {
  // Role chips are the user's own TITLES (source of record); raw target_roles
  // (taxonomy clusters) only for pre-Phase-0 rows that never stored titles.
  const titles = (p?.target_role_titles ?? []).filter((r) => r.trim())
  return {
    roles: titles.length ? titles : (p?.target_roles ?? []).filter((r) => r.trim()),
    location: p?.target_location ?? "",
    dealBreakers: (p?.deal_breakers ?? []).filter((d) => d.trim()),
    // No column to seed from — a lean IS a memory fact, so it arrives only
    // through the preflight manifest below.
    lean: [],
    careerGoal: p?.career_goal ?? "",
    superpower: p?.superpower ?? "",
  }
}

/** The Targeting Brief's gap-filled manifest → draft. Same shape as seed();
 *  empty fields arrive silently prefilled from the user's memory facts. */
function seedFromPreflight(pf: RefreshPreflightResponse): Draft {
  return {
    roles: pf.role_titles,
    location: pf.location ?? "",
    dealBreakers: pf.deal_breakers,
    lean: pf.lean,
    careerGoal: pf.career_goal ?? "",
    superpower: pf.superpower ?? "",
  }
}

function eqArr(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/* ─── CV chip copy, honest to readiness (no fabricated numbers) ─────────── */
function cvLabel(p?: GateProfile | null): { text: string; tone: "ready" | "warn" | "muted" } {
  switch (p?.cv_readiness) {
    case "ready":      return { text: "CV baseline · ready", tone: "ready" }
    case "processing": return { text: "CV processing…",       tone: "muted" }
    case "failed":     return { text: "CV upload failed · re-upload", tone: "warn" }
    default:           return { text: "No CV yet · add one to sharpen matches", tone: "warn" }
  }
}

export function MatchRefreshGate({ token, profile, onRun }: MatchRefreshGateProps) {
  const open = useRefreshGateStore((s) => s.open)
  const close = useRefreshGateStore((s) => s.closeRefreshGate)
  const balance = useXPStore((s) => s.balance)
  const queryClient = useQueryClient()

  // Price comes from the server (see below) — the client constant is only the
  // pre-load placeholder, so the modal can never quote a number the wallet
  // disagrees with. Wired after `preflight` loads.
  const [cost, setCost] = useState<number>(COST)
  const { canAfford, attempt } = useCoinsGate({ cost, action: "match_refresh" })

  const [draft, setDraft] = useState<Draft>(() => seed(profile))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const touched = useRef(false)

  /** A concierge proposal → the DRAFT. Never a write: the modal's three exits
   *  (Run / Save targeting only / Discard) stay the single commit point, so the
   *  distiller's propose-only lock on profile columns holds and Discard still
   *  means discard. `touched` is set so the preflight seed cannot overwrite what
   *  the user just said out loud. */
  const applyProposal = useCallback((diff: IntentFilterDiff) => {
    touched.current = true
    setDraft((d) => {
      const dropped = new Set(diff.remove_roles.map((r) => r.toLowerCase()))
      const kept = d.roles.filter((r) => !dropped.has(r.toLowerCase()))
      const seen = new Set(kept.map((r) => r.toLowerCase()))
      const roles = [...kept]
      for (const r of diff.add_roles) {
        if (!seen.has(r.toLowerCase())) { seen.add(r.toLowerCase()); roles.push(r) }
      }
      return {
        ...d,
        roles: roles.slice(0, MAX_CHIPS),
        location: diff.locations[0] ?? d.location,
        // Additive: a conversation that surfaces one new dealbreaker must not
        // silently drop the ones already on screen.
        dealBreakers: [
          ...d.dealBreakers,
          ...diff.deal_breakers.filter(
            (b) => !d.dealBreakers.some((x) => x.toLowerCase() === b.toLowerCase()),
          ),
        ].slice(0, MAX_CHIPS),
        careerGoal: diff.career_goal ?? d.careerGoal,
        superpower: diff.superpower ?? d.superpower,
        // Myro has no lean diff yet; the conversation proposes the other five.
        lean: d.lean,
      }
    })
  }, [])

  const dialogRef = useRef<HTMLDivElement>(null)

  /* Targeting Brief manifest — profile fields gap-filled from user_memory.
     Fail-soft: while loading / on error the gate runs on the raw profile. */
  const { data: preflight } = useQuery({
    queryKey: ["refreshPreflight"],
    queryFn: () => jobs.refreshPreflight(token!),
    enabled: open && !!token,
    staleTime: 0,
  })

  // Server decides the price: free when Myro landed roles this user has never
  // been matched against (they didn't ask for the inventory — they shouldn't pay
  // to look at it), flat MATCH_RUN_COST when they're asking for another pass.
  const serverCost = preflight?.run_cost
  const newJobs = preflight?.new_jobs_count ?? 0
  useEffect(() => {
    if (typeof serverCost === "number") setCost(serverCost)
  }, [serverCost])
  const free = cost === 0

  const base = useMemo(() => seed(profile), [profile])
  const briefSeed = useMemo(
    () => (preflight ? seedFromPreflight(preflight) : base),
    [preflight, base],
  )
  const draftEq = (a: Draft, b: Draft) =>
    eqArr(a.roles, b.roles) &&
    a.location === b.location &&
    eqArr(a.dealBreakers, b.dealBreakers) &&
    a.careerGoal === b.careerGoal &&
    a.superpower === b.superpower

  // dirty = needs persisting (vs stored profile) — memory prefill counts, so
  // Run/Save writes it through. userDirty = the user actually edited — only
  // that earns a discard-confirm.
  const dirty = !draftEq(draft, base)
  const userDirty = !draftEq(draft, briefSeed)

  /* Re-seed the staging buffer each time the gate opens. */
  useEffect(() => {
    if (open) {
      setDraft(seed(profile))
      setConfirming(false)
      setBusy(false)
      touched.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* Silent prefill: when the brief lands and the user hasn't typed yet, the
     gap-filled manifest replaces the raw-profile seed in place. */
  useEffect(() => {
    if (open && preflight && !touched.current) setDraft(seedFromPreflight(preflight))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preflight])

  /* Autofocus the primary action (power-user: click → Enter). */
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (canAfford) document.getElementById("tm-refresh-run")?.focus()
      else dialogRef.current?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [open, canAfford])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Not signed in.")
      // Titles, not clusters: the backend derives the target_roles cluster
      // union from target_role_titles (one writer — see role_title_updates).
      return users.updateProfile(token, {
        target_role_titles: draft.roles,
        target_location: draft.location.trim() || null,
        deal_breakers: draft.dealBreakers,
        // Routed to the authored-preference writer server-side; it has no column.
        lean: draft.lean,
        career_goal: draft.careerGoal.trim() || null,
        superpower: draft.superpower.trim() || null,
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.profile() }),
  })

  if (!open || typeof document === "undefined") return null

  const persistIfDirty = async () => {
    if (dirty) await saveMutation.mutateAsync()
  }

  /* ── Exits ──────────────────────────────────────────────────────────── */

  // Esc / click-outside / × / Discard — only USER edits earn a confirm;
  // Myro's own memory prefill is never worth nagging about.
  const requestClose = () => {
    if (busy) return
    if (userDirty && !confirming) {
      setConfirming(true)
      return
    }
    close()
  }

  // Save targeting only — persist, no spend.
  const handleSaveOnly = async () => {
    if (busy || !dirty) return
    setBusy(true)
    try {
      await persistIfDirty()
      close()
    } catch {
      setBusy(false) // surface stays open; mutation error shown inline
    }
  }

  // Run analysis — persist (ordering guarantee), then spend + hand off.
  const handleRun = () => {
    if (busy || !canAfford) return
    attempt(async () => {
      setBusy(true)
      try {
        await persistIfDirty() // save BEFORE spend — never charge against stale targeting
        close()
        onRun()
      } catch {
        setBusy(false)
      }
    })
  }

  const cv = cvLabel(profile)
  const cvHref = profile?.cv_url || "/cv"
  const shortfall = cost - balance

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Myro Search"
      onClick={requestClose}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "tm-gate-fade 160ms var(--tm-ease) both",
      }}
    >
      <style>{`
        @keyframes tm-gate-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tm-gate-rise { from { opacity: 0; transform: translateY(8px) scale(0.985) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) {
          .tm-gate-panel { animation: none !important }
        }
      `}</style>

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="tm-gate-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(540px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-int-border)",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          outline: "none",
          animation: "tm-gate-rise 200ms var(--tm-ease) both",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid var(--tm-border-soft)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{
                fontFamily: "var(--tm-font-mono)", fontSize: 10.5, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 6,
              }}>
                Myro Ops · pre-flight
              </div>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 650, color: "var(--tm-text)", lineHeight: 1.2 }}>
                Myro Search
              </h3>
            </div>
            <button
              type="button" onClick={requestClose} aria-label="Close"
              style={{ background: "transparent", border: "none", color: "var(--tm-interactive-rest)", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 2 }}
            >×</button>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--tm-text-muted)", lineHeight: 1.55 }}>
            Tell Myro what you want, or edit it below. Then it scans the live
            market against your CV.
          </p>
        </div>

        {/* ── Conversation first, manifest as its receipt ───────────────
            The 7 rows used to be the input. Someone who cannot phrase a
            dealbreaker as a chip types junk, and that reaches the matcher as
            truth. Myro asks; the rows below show what it heard and stay
            editable. Nothing here writes — see MyroChat. */}
        <div style={{ padding: "16px 22px 0" }}>
          <MyroChat
            token={token}
            surface="job_intent"
            seed="Tell me what you're after — the kind of work, where, and anything you won't accept. I'll set the search up from that."
            onPropose={applyProposal}
          />
        </div>

        {/* ── The order, as prose ────────────────────────────────────────
            Six labelled rows became one sentence whose nouns are the controls.
            The rows made the thing being confirmed the smallest text on screen,
            and they asked the user to phrase a dealbreaker as a chip — "e.g. no
            relocation" — in the same control that was rendering a memory fact
            reading "May prefer consultative or partnering work". One of those is
            a tag and the other is a sentence; a chip could only ever hold one. */}
        <div style={{ padding: "18px 22px 6px" }}>
          <TargetingSentence
            value={{
              roles: draft.roles,
              location: draft.location,
              lean: draft.lean,
              avoid: draft.dealBreakers,
              goal: draft.careerGoal,
              power: draft.superpower,
            }}
            maxPerGroup={MAX_CHIPS}
            onChange={(next) => {
              touched.current = true
              setDraft({
                roles: next.roles,
                location: next.location,
                lean: next.lean,
                dealBreakers: next.avoid,
                careerGoal: next.goal,
                superpower: next.power,
              })
            }}
          />
        </div>

        {/* What Myro brings to the search that the sentence does not name — the
            CV it reads from, and the notes behind it. Sources, not settings, so
            they sit under the order rather than in it. The numbered labels went
            with the rows: 01–06 read as a sequence over fields that had no
            order, and one sentence has no steps to number. */}
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
          padding: "14px 22px 4px",
        }}>
          <a
            href={cvHref} target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "7px 12px", borderRadius: 999, textDecoration: "none",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${cv.tone === "warn" ? "rgba(251,191,113,0.3)" : "var(--tm-border-soft)"}`,
              fontSize: 12.5,
              color: cv.tone === "ready" ? "var(--tm-text)" : cv.tone === "warn" ? "var(--tm-warning)" : "var(--tm-text-muted)",
              fontFamily: "var(--tm-font-mono)", letterSpacing: "0.01em",
            }}
          >
            <span aria-hidden>📄</span>
            {cv.text}
            <span aria-hidden style={{ opacity: 0.6 }}>↗</span>
          </a>
          {(preflight?.memory_count ?? 0) > 0 && (
            <span style={{
              fontSize: 12.5, color: "var(--tm-text-muted)",
              fontFamily: "var(--tm-font-mono)", letterSpacing: "0.01em",
            }}>
              + {preflight!.memory_count} notes Myro remembers
            </span>
          )}
        </div>

        {/* ── Consent readout (extractable core) ───────────────────────── */}
        <div style={{ padding: "8px 22px 6px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "11px 14px", borderRadius: "var(--tm-radius-sm)",
            background: canAfford ? "var(--tm-int-bg-wash)" : "var(--tm-danger-wash)",
            border: `1px solid ${canAfford ? "var(--tm-int-border)" : "rgba(251,113,133,0.3)"}`,
          }}>
            <XPCoin />
            {free ? (
              <div style={{ fontSize: 12.5, color: "var(--tm-text)", lineHeight: 1.5 }}>
                <strong style={{ fontFamily: "var(--tm-font-mono)", fontWeight: 600 }}>Free</strong>
                {" · "}
                <span style={{ color: "var(--tm-text-muted)" }}>
                  {newJobs > 0
                    ? `Myro found ${formatCount(newJobs)} roles since your last search`
                    : "this search is on us"}
                </span>
              </div>
            ) : canAfford ? (
              <div style={{ fontSize: 12.5, color: "var(--tm-text)", lineHeight: 1.5 }}>
                <strong style={{ fontFamily: "var(--tm-font-mono)", fontWeight: 600 }}>{cost} Myro Coins</strong>
                {" · "}<span style={{ color: "var(--tm-text-muted)" }}>per search</span>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                <strong style={{ fontFamily: "var(--tm-font-mono)", fontWeight: 600, color: "var(--tm-danger)" }}>
                  Need {cost} · you have {balance}
                </strong>
                <span style={{ color: "var(--tm-text-muted)" }}>{` (${shortfall} short)`}</span>{" — "}
                <Link href="/tokens" onClick={() => close()} style={{ color: "var(--tm-interactive)", textDecoration: "none" }}>
                  See how Myro Coins work →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer: three exits, or discard-confirm ──────────────────── */}
        <div style={{ padding: "10px 22px 20px" }}>
          {confirming ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 12.5, color: "var(--tm-text-muted)" }}>Discard your targeting edits?</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep editing</Button>
                <Button variant="dismiss" size="sm" onClick={() => close()}>
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Button variant="dismiss" size="md" onClick={requestClose} disabled={busy}>
                Discard
              </Button>
              <div style={{ display: "flex", gap: 8 }}>
                {dirty && (
                  <Button variant="outline" size="md" onClick={handleSaveOnly} loading={busy}>
                    Save targeting only
                  </Button>
                )}
                <Button
                  id="tm-refresh-run"
                  variant="solid" size="md"
                  onClick={handleRun}
                  disabled={!canAfford || busy}
                  loading={busy}
                >
                  {free ? "▸ Run · Free" : `▸ Run · ${cost}`}
                </Button>
              </div>
            </div>
          )}

          {saveMutation.isError && (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--tm-danger)", fontFamily: "var(--tm-font-mono)" }}>
              Couldn’t save your targeting. Try again.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ─── Internal building blocks ─────────────────────────────────────────── */

function XPCoin() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="8" stroke="var(--tm-interactive)" strokeWidth="1.4" />
      <path d="M10 5.5v9M7.5 8h3.2a1.6 1.6 0 0 1 0 3.2H7.8" stroke="var(--tm-interactive)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
