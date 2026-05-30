# MatchRefreshGate — Session Handoff (2026-05-30)

Pick-up doc for the Refresh-matches consent + targeting gate initiative.

## Status: frontend slice BUILT + typecheck-clean. Backend half NOT built.

---

## Locked design decisions (grilled with CEO, do not re-litigate)

- **D1** Edits persist to the **canonical profile** (single source of truth). Gate is a confirmation *view*, not a 3rd editor. Persists via `users.updateProfile`.
- **D2** 5 light targeting fields inline-editable; **CV = read-only chip → opens in new tab**.
- **D3** Centered modal, reuses `JobMatchDetail` dialog pattern + `--tm-*` tokens.
- **D4** Consent **every** refresh, no don't-ask-again. Primary CTA: "▸ Run analysis", consent line "Up to 150 XP · charged only if new matches found".
- **D5** Broke users still **open** the gate (editing free); Run disabled with "Need 150 · you have N" + "See how XP works →" routing to **/xp** (canonical, NOT a new earn list).
- **D6** Staged edits, decoupled from spend. Three exits: **Run** (save+spend), **Save targeting only** (save, no spend), **Discard** (confirm if dirty).
- **D7** On Run, modal closes, hands to existing progress flow.
- **D8** Three-module split (Ousterhout-aligned): reuse `useXPGate` (policy) + `XPGateModal` (generic broke modal) UNTOUCHED; new `MatchRefreshGate` *consumes* `useXPGate`. Inner core (consent readout + footer + broke state) marked extractable → future generic `AgentRunGate` when a 2nd rich-consent action appears.
- **D9 (scale)** Completion should reach the user **app-wide** (toast), surviving navigation, via **per-user-filtered realtime** — NOT the 30s poll.
- **D-price** Refresh = **150 XP** (backend `MATCH_REFRESH_XP_COST` was already 150; frontend `xp-policy.ts` was wrongly 50 → fixed to 150).
- **Scope chosen by CEO:** ONE scale-ready initiative (gate + async backend together). Frontend slice shipped first; backend half pending.

## Aesthetic
Pre-flight console: numbered 6-input manifest, mono micro-labels, honest consent readout, XP-coin glyph. Refined/instrument-panel, matches mission-control.

---

## BUILT (frontend, typecheck-clean `tsc --noEmit` EXIT=0)

| File | Change |
|---|---|
| `store/refreshGateStore.ts` | NEW — singleton open-signal (mirrors `xpGateStore`). `openRefreshGate()`. |
| `components/jobs/MatchRefreshGate.tsx` | NEW — the gate. Manifest, consent, 3 exits, broke state, autofocus Run (id `tm-refresh-run`), extractable-core comment. |
| `lib/xp-policy.ts` | `matchRefreshCost` 50 → **150**. Cascades to `useJobRefresh` + `useXPGate`. |
| `components/jobs/RefreshMatchesButton.tsx` | Click → `openRefreshGate()` (was `vm.refresh()`); removed inline "−XP" text; broke no longer blocks the click. |
| `components/mission-control/job-index.tsx` | Stale "Refresh now" → `openRefreshGate()`. |
| `app/(authed)/home/page.tsx` | Mounts `<MatchRefreshGate token profile onRun={() => refreshVm.refresh()} />`. |

Note: CV chip shows real `cv_readiness` state (no fabricated "24 skills" — profile exposes no CV skill count).

---

## NOT BUILT — Horizon 2 (backend / scale). Pick these up next.

Backend is ~80% there already: `backend/app/services/job_refresh/` has RQ queue (`_redis_state.py`, `jobs_compute`, 15-min job timeout), Redis ticket state, `_xp_charge.py` (charge-at-start + refund). Real gaps:

1. **Idempotency key on `JobRefresh.start`** (`facade.py`) — HIGHEST PRIORITY, smallest. Today: charge-then-dispatch with a fresh ticket per call → a double-clicked Run = **two 150-XP charges**. Add a dedupe/idempotency key.
2. **Swap 30s frontend poll → per-user-filtered Supabase realtime** on `user_job_matches`. THE scale bug: worker runs up to 15 min but `use-job-refresh.ts` poll quits at 30s and shows "timed out · refunded" while the worker keeps going + the 150 XP was already charged (not refunded by a frontend timeout). Realtime fixes the false-timeout AND powers the app-wide toast.
3. **App-wide completion toast** — new `toastStore` + `<Toast/>` (hand-rolled, `--tm-*`, `aria-live="polite"`, mirror `xpGateStore` precedent; no new dep). Fires on realtime completion, survives navigation. Copy: "Matches ready · N new" / "No new matches · XP refunded".
4. **Fix unfiltered `jobs` realtime sub** — `lib/hooks/use-jobs-realtime.ts` subscribes to ALL `jobs` table changes with no filter → broadcast storm at 10k users. Filter it.

---

## GIT SITUATION (blocker — read before "push to develop")

- `frontend/` is its OWN git repo (nested), branch `main`, **NO remote configured** → cannot push anywhere yet.
- No `develop` branch exists (only `main` + two `claude/*`). Parent `True_Yodha` repo is on `Develop` but does NOT track `frontend/`.
- Entire frontend tree is mid-restructure: 100+ uncommitted WIP files (app/ → app/(authed)/ move). My edits to `RefreshMatchesButton.tsx` / `job-index.tsx` sit ON TOP of the owner's uncommitted versions — they show `??` untracked, not clean diffs.
- **Action needed from owner:** add a remote + create `develop`, OR confirm committing my 6 files into the in-progress restructure. Until then this slice lives only in the working tree (+ this doc + auto-memory).