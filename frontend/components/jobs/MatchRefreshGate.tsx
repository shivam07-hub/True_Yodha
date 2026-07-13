"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { jobs, users, type RefreshPreflightResponse, type UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { MYRO_COINS_POLICY } from "@/lib/xp-policy"
import { useCoinsGate } from "@/lib/hooks/use-xp-gate"
import { useXPStore } from "@/store/xpStore"
import { useRefreshGateStore } from "@/store/refreshGateStore"

/**
 * MatchRefreshGate — the consent + targeting-review gate for "Refresh matches".
 *
 * Design record (grilled 2026-05-30; Targeting Brief 2026-07-07):
 *  - Persists edits to the CANONICAL profile (single source of truth).
 *  - Seeds from GET /jobs/refresh/preflight (the Targeting Brief): empty
 *    fields arrive silently prefilled from user_memory; prefill lives in the
 *    DRAFT and persists only through the user's Run/Save action. Role chips
 *    are human TITLES — the backend derives the matcher's cluster union.
 *  - The 6 Myro Ops agent inputs are VISIBLE by default as a compact
 *    manifest; 5 are inline-editable, the CV is a read-only chip → new tab.
 *  - Flat charge: "100 Myro Coins per search" — every run, no free-if-new tier
 *    (mirrors the backend MATCH_RUN_COST=100; refund only on system failure).
 *  - Three exits: Run · 100 (save+spend) / Save targeting only / Discard.
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

  // Flat charge, every run — no free-if-new tier (the backend charges a flat
  // MATCH_RUN_COST=100 on confirm; refund only on system failure).
  const { canAfford, attempt } = useCoinsGate({ cost: COST, action: "match_refresh" })

  const [draft, setDraft] = useState<Draft>(() => seed(profile))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const touched = useRef(false)

  const dialogRef = useRef<HTMLDivElement>(null)

  /* Targeting Brief manifest — profile fields gap-filled from user_memory.
     Fail-soft: while loading / on error the gate runs on the raw profile. */
  const { data: preflight } = useQuery({
    queryKey: ["refreshPreflight"],
    queryFn: () => jobs.refreshPreflight(token!),
    enabled: open && !!token,
    staleTime: 0,
  })

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

  /* ── Chip helpers ───────────────────────────────────────────────────── */
  const addChip = (key: "roles" | "dealBreakers", value: string) => {
    const v = value.trim()
    if (!v) return
    touched.current = true
    setDraft((d) => {
      const list = d[key]
      if (list.length >= MAX_CHIPS || list.some((x) => x.toLowerCase() === v.toLowerCase())) return d
      return { ...d, [key]: [...list, v] }
    })
  }
  const removeChip = (key: "roles" | "dealBreakers", i: number) => {
    touched.current = true
    setDraft((d) => ({ ...d, [key]: d[key].filter((_, idx) => idx !== i) }))
  }

  const cv = cvLabel(profile)
  const cvHref = profile?.cv_url || "/cv"
  const shortfall = COST - balance

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
            Myro reads the inputs below, then scans the live market against your CV.
            Edit anything here — it saves to your profile.
          </p>
        </div>

        {/* ── Manifest (refresh-specific) ──────────────────────────────── */}
        <div style={{ padding: "16px 22px 4px" }}>
          <ManifestRow n={1} label="Target roles">
            <ChipField
              items={draft.roles} max={MAX_CHIPS} placeholder="Add a role — Enter"
              onAdd={(v) => addChip("roles", v)} onRemove={(i) => removeChip("roles", i)}
              tone="interactive"
            />
          </ManifestRow>

          <ManifestRow n={2} label="Location">
            <TextField
              value={draft.location} placeholder="e.g. Bengaluru / Remote"
              onChange={(v) => { touched.current = true; setDraft((d) => ({ ...d, location: v })) }}
            />
          </ManifestRow>

          <ManifestRow n={3} label="Deal-breakers">
            <ChipField
              items={draft.dealBreakers} max={MAX_CHIPS} placeholder="e.g. no relocation — Enter"
              onAdd={(v) => addChip("dealBreakers", v)} onRemove={(i) => removeChip("dealBreakers", i)}
              tone="danger"
            />
          </ManifestRow>

          <ManifestRow n={4} label="Career goal">
            <TextField
              value={draft.careerGoal} placeholder="e.g. move into platform work in 2 years"
              onChange={(v) => { touched.current = true; setDraft((d) => ({ ...d, careerGoal: v })) }}
            />
          </ManifestRow>

          <ManifestRow n={5} label="Superpower">
            <TextField
              value={draft.superpower} placeholder="e.g. untangling legacy systems"
              onChange={(v) => { touched.current = true; setDraft((d) => ({ ...d, superpower: v })) }}
            />
          </ManifestRow>

          {/* CV — read-only, opens new tab */}
          <ManifestRow n={6} label="CV">
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
          </ManifestRow>

          {/* Memory — honesty line for the full-brief prompt: the agent also
              reads the user's memory facts, not just the rows above. */}
          {(preflight?.memory_count ?? 0) > 0 && (
            <ManifestRow n={7} label="Memory">
              <span style={{
                display: "inline-block", padding: "8px 0",
                fontSize: 12.5, color: "var(--tm-text-muted)",
                fontFamily: "var(--tm-font-mono)", letterSpacing: "0.01em",
              }}>
                {preflight!.memory_count} notes · read by the agent
              </span>
            </ManifestRow>
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
            {canAfford ? (
              <div style={{ fontSize: 12.5, color: "var(--tm-text)", lineHeight: 1.5 }}>
                <strong style={{ fontFamily: "var(--tm-font-mono)", fontWeight: 600 }}>{COST} Myro Coins</strong>
                {" · "}<span style={{ color: "var(--tm-text-muted)" }}>per search</span>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                <strong style={{ fontFamily: "var(--tm-font-mono)", fontWeight: 600, color: "var(--tm-danger)" }}>
                  Need {COST} · you have {balance}
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
                <Button
                  variant="outline" size="sm" onClick={() => close()}
                  className="!text-[var(--tm-danger)] !border-[rgba(251,113,133,0.4)] hover:!bg-[var(--tm-danger-wash)]"
                >
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Button variant="ghost" size="md" onClick={requestClose} disabled={busy}>
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
                  ▸ Run · {COST}
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

function ManifestRow({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--tm-border-soft)" }}>
      <div style={{
        flex: "0 0 auto", width: 92, paddingTop: 3,
        display: "flex", alignItems: "baseline", gap: 7,
      }}>
        <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, color: "var(--tm-text-faint)", fontVariantNumeric: "tabular-nums" }}>
          {String(n).padStart(2, "0")}
        </span>
        <span style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
          color: "var(--tm-text-muted)",
        }}>
          {label}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function TextField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="text" value={value} placeholder={placeholder} autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: "100%", padding: "8px 11px", boxSizing: "border-box",
        borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.03)",
        border: `1px solid ${focused ? "var(--tm-int-border)" : "var(--tm-border-soft)"}`,
        color: "var(--tm-text)", fontSize: 13, fontFamily: "inherit", outline: "none",
        transition: "border-color var(--tm-dur) var(--tm-ease)",
      }}
    />
  )
}

function ChipField({
  items, max, placeholder, onAdd, onRemove, tone,
}: {
  items: string[]; max: number; placeholder: string
  onAdd: (v: string) => void; onRemove: (i: number) => void
  tone: "interactive" | "danger"
}) {
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const atMax = items.length >= max
  const chipBg = tone === "danger" ? "var(--tm-danger-wash)" : "var(--tm-int-bg-wash)"
  const chipBd = tone === "danger" ? "rgba(251,113,133,0.3)" : "var(--tm-int-border)"
  const chipFg = tone === "danger" ? "var(--tm-danger)" : "var(--tm-interactive)"

  const commit = () => { onAdd(input); setInput(""); ref.current?.focus() }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <input
        ref={ref} type="text" value={input} disabled={atMax} autoComplete="off"
        placeholder={atMax ? "Max reached" : placeholder}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit() }
          else if (e.key === "Backspace" && !input && items.length) onRemove(items.length - 1)
        }}
        style={{
          width: "100%", padding: "8px 11px", boxSizing: "border-box",
          borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.03)",
          border: `1px solid ${focused ? "var(--tm-int-border)" : "var(--tm-border-soft)"}`,
          color: "var(--tm-text)", fontSize: 13, fontFamily: "inherit", outline: "none",
          opacity: atMax ? 0.45 : 1,
          transition: "border-color var(--tm-dur) var(--tm-ease)",
        }}
      />
      {items.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((it, i) => (
            <span key={`${it}-${i}`} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 7px 4px 11px", borderRadius: 999,
              background: chipBg, border: `1px solid ${chipBd}`, color: chipFg, fontSize: 12.5,
            }}>
              {it}
              <button
                type="button" onClick={() => onRemove(i)} aria-label={`Remove ${it}`}
                style={{
                  width: 15, height: 15, borderRadius: "50%", padding: 0, border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: tone === "danger" ? "rgba(251,113,133,0.2)" : "rgba(255,255,255,0.08)",
                  color: chipFg, fontSize: 11, lineHeight: 1,
                }}
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function XPCoin() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="8" stroke="var(--tm-interactive)" strokeWidth="1.4" />
      <path d="M10 5.5v9M7.5 8h3.2a1.6 1.6 0 0 1 0 3.2H7.8" stroke="var(--tm-interactive)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
