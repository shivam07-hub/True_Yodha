# Myrology Interest Toggle — Change Plan

> Free opt-in interest preference that reveals the Myrology nav entry, kept
> distinct from the paid `myrology_unlocked` entitlement. Grilled & locked
> 2026-05-30.

## Problem

Today the Myrology nav item gates on `myrology_unlocked` — a **paid ₹499
entitlement** that also guards the backend `/myrology/*` routes (intake,
bookings). There is no way for a user to express *interest* without paying, and
no surface that invites the curious in. We want seekers to opt in for free,
reveal the nav icon, and land on the existing offering/paywall page — then pay.

## Core decision: two flags, not one

| Flag | Owner | Meaning | Gates |
|---|---|---|---|
| `myrology_interested` | user toggle (free) | "show me Myrology" | **nav visibility** + NEW pill |
| `myrology_unlocked` | payment (₹499) | paid entitlement | backend routes + unlocked panel |

Collapsing them would let anyone flip a switch and pass the backend route guard
free. Separate flags keep a clean funnel: **toggle on → icon appears → offering
page sells ₹499 → pay → `myrology_unlocked` → full feature.**

## Locked decisions

1. **Two separate flags** (above).
2. **`myrology_interested` defaults `false`** — pure opt-in, hidden for most.
3. **Nav reveal predicate = `myrology_interested` only** (uniform for all users).
   - Payment auto-sets `myrology_interested = true`, so payers get the icon
     without hunting the toggle.
   - A payer who toggles off → icon hides, but `myrology_unlocked` persists in
     DB → toggle back on, full paid access intact. No refund/access risk.
4. **Treatment identical for all users** — toggle visible + operable for
   everyone; no hide/lock special-casing for payers.
5. **Opt-in = intro + confirm prompt** (not a bare switch). Toggle is "armed
   intent"; the prompt confirms.
   - Question copy: **"Interested in following the signal from cosmos?"**
   - Privacy line says only **what we do** (collect date / time / place to read
     your chart). **No "we don't ask your name" line** — pointless to advertise
     an absence.
   - **Confirm** → `interested=true`, icon appears. **Cancel** → toggle snaps
     back off, nothing saved.
6. **Toggle off = instant, no prompt** (low-friction exit). Sends explicit
   `false` (survives `exclude_none`, persists correctly).
7. **No XP** for toggling — it's a preference, not an achievement.
8. **Discovery = account menus** (not silent settings-only). The dropdown
   Myrology item is the acquisition surface; Settings toggle is management.
9. **Coachmark dropped** for Myrology — the confirm prompt is the introduction.
   **NEW pill kept** (renders independent of `coach`).
10. **Mobile bottom bar: Myrology stays out** (`surfaces: ["desktop"]`, no
    `mobileIcon`). Added to the **mobile account sheet** instead.

## Account-menu restructure

### Desktop dropdown — `frontend/components/app-shell.tsx`
`FEEDBACK_QUICK_ACTIONS` currently: `bug` / `idea` / `praise`, all open the
feedback hub.

- `Report a bug` (bug) → **stays**.
- `Suggest an idea` slot → **becomes `✦ Myrology`**. Click:
  - if `interested` → navigate `/myrology`
  - else → open intro+confirm prompt
- `Leave feedback` (praise) → **renamed `Feedback and ideas`**, now the single
  feedback entry (covers idea + praise). Opens hub with category `idea`.

### Mobile account sheet — `frontend/mobile/shell.tsx` (~line 326)
Current rows: `My Profile` / `Send Feedback` / `Sign out`.
- Add `✦ Myrology` row (same behavior as desktop).
- Rename `Send Feedback` → `Feedback and ideas` (opens hub, category `idea`).

## File-by-file changes

### Backend
- **`database/migrations/20260530c_myrology_interest.sql`** (new):
  ```sql
  BEGIN;
  ALTER TABLE public.user_profiles
      ADD COLUMN IF NOT EXISTS myrology_interested boolean NOT NULL DEFAULT false;
  COMMIT;
  ```
- **`backend/app/schemas/users.py`**:
  - `UserProfileResponse` += `myrology_interested: bool = False`
  - `UpdateProfileRequest` += `myrology_interested: bool | None = None`
- **`backend/app/routers/payments.py`** `_unlock_myrology`:
  ```python
  get_supabase_admin().table("user_profiles").update(
      {"myrology_unlocked": True, "myrology_interested": True}
  ).eq("id", user_id).execute()
  ```
- **`backend/app/routers/users.py`** `update_profile` — **no change**. Generic
  `model_dump(exclude_none=True)` → `users_repo.update_profile(dict)` already
  carries the new field. Explicit `false` is kept (only `None` is excluded).

### Frontend — types & nav
- **`frontend/lib/api.ts`**:
  - `UserProfile` += `myrology_interested?: boolean`
  - `ProfileUpdate` += `myrology_interested?: boolean`
- **`frontend/lib/nav-items.ts`**:
  - `NavUnlockCtx` += `myrologyInterested: boolean`
  - Myrology item: `unlock: (ctx) => ctx.myrologyInterested`; **remove `coach`**.
  - `deriveNavUnlockCtx(versions, profile)` — read
    `profile?.myrology_interested ?? false`; widen the `profile` Pick type to
    include `myrology_interested`.
- **`frontend/lib/hooks/use-nav-unlocks.ts`** — no logic change; NEW-pill path
  already fires on the `interested` transition. (Coach queue simply never
  enqueues Myrology now that `coach` is undefined — verify Coachmark render
  guard `if (!item.coach) return null` holds; it does.)

### Frontend — surfaces
- **`frontend/components/app-shell.tsx`** — dropdown restructure (above) +
  mount the shared opt-in prompt modal; wire Myrology item click handler.
- **`frontend/mobile/shell.tsx`** — account-sheet restructure (above).
- **`frontend/components/settings-modal.tsx`** — Account tab, new "Myrology"
  row with toggle. Toggle-on fires the shared prompt; confirm →
  `schedule({ myrology_interested: true })`; toggle-off →
  `schedule({ myrology_interested: false })`. Profile mutation already
  invalidates `dataKeys.profile()`, so nav recomputes for free.
- **Shared prompt component** (new, e.g. `frontend/components/myrology-optin-prompt.tsx`)
  — used by all three surfaces. Intro + Confirm/Cancel. Cancel reverts caller's
  optimistic toggle.

## Data flow

```
opt-in (dropdown / mobile sheet / settings toggle)
  → intro+confirm prompt  ("Interested in following the signal from cosmos?")
  → Confirm → PUT /me/profile { myrology_interested: true }
  → invalidate profile query → useNavUnlocks recomputes
  → ctx.myrologyInterested = true → Myrology nav item visible + NEW pill
  → click icon → /myrology offering page (LockedOnly + MyrologyCta)
  → pay ₹499 → _unlock_myrology sets {unlocked, interested}=true
  → backend /myrology/* routes pass → full feature
```

## Test notes
- Backend: extend `test_payments_router.py` — verify `_unlock_myrology` writes
  `myrology_interested=true` alongside `myrology_unlocked`.
- Backend: `update_profile` accepts `myrology_interested` true→false→true round
  trip (confirm `false` is persisted, not dropped).
- Frontend: nav `visibleNavItems("desktop")` includes Myrology iff
  `myrologyInterested`; excluded by default; payer-toggled-off hides icon but
  `/myrology` stays reachable by URL and entitlement intact.
- Frontend: Cancel on prompt leaves `interested=false` (no write).

## Open / deferred
- Discovery is menu-driven, not pushed (no dashboard nudge). Accepted for now;
  revisit if opt-in rate is low.
- `Feedback and ideas` default category = `idea` — confirm hub copy still reads
  well when it's the only feedback entry.