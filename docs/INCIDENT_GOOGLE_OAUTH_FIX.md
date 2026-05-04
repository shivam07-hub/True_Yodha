# Incident — Google OAuth Sign-In Broken in Production

**Severity:** SEV2
**Status:** Identified, fix not yet applied
**Filed:** 2026-05-04
**Owner:** Shivam
**Pickup:** Claude Code

---

## Symptom (what the user sees)

1. User visits `https://truemirror.vercel.app` and clicks "Sign in with Google".
2. Google consent screen displays:
   - **Title:** "Sign in to gipvxuugajkugntwkeiz.supabase.co" (ugly, untrusted-looking)
   - No app logo, no app name, no privacy/terms links.
3. After picking an account and clicking Continue, browser is redirected to `http://localhost/...` and shows a Next.js **404: This page could not be found**.
4. Google may also show "this app isn't verified" warning, or block unknown users entirely.

Net effect: **the entire Google sign-up funnel is broken in production.** Email/password may still work, but anyone landing on the site who clicks Google → gets a dead end.

---

## Root cause analysis (3 separate problems, often confused as one)

### Problem 1 — Ugly OAuth consent screen ("gipvxuugajkugntwkeiz.supabase.co")

The Google Cloud OAuth Consent Screen has never been branded. When the **App Name** field is empty, Google falls back to displaying the redirect URI's hostname — which is the Supabase project URL, because Supabase is the OAuth callback target. This is by design.

**This is NOT fixable by renaming Supabase.** The string `gipvxuugajkugntwkeiz` is the immutable project reference. It's baked into the database hostname, API URL, storage URL, and JWT issuer. The only way to change it is creating a new Supabase project and migrating everything — which we should not do for cosmetic reasons.

The fix is purely in **Google Cloud Console** — set a proper App Name + logo + support email and the consent screen will say "Sign in to Myro" with the supabase domain only appearing in tiny print under "Google will allow ___ to access this info about you" (normal behavior every Supabase-backed app has).

### Problem 2 — Redirect lands on `localhost/404` after consent

Supabase Auth `Site URL` (or `Additional Redirect URLs`) is set to `http://localhost:3000` instead of `https://truemirror.vercel.app`. After Google returns the auth code, Supabase issues a redirect using the `Site URL` as the fallback — which is localhost. End user's browser tries to hit a server that doesn't exist on their machine → 404.

Likely the frontend `signInWithOAuth()` call also doesn't pass an explicit `redirectTo` option, so Supabase falls through to the broken `Site URL`.

### Problem 3 — Google blocking unknown users ("not following conventions")

Almost certainly the OAuth Consent Screen is in **"Testing"** publishing status, which caps sign-in to 100 users — all of whom must be added as test users by email. Anyone not on that list is blocked. Solution: brand the consent screen first (Problem 1), then publish it.

If we only request basic scopes (`openid`, `email`, `profile`) — which is what Supabase Google auth uses by default — we do NOT need formal Google verification. Publishing makes the app live for all users immediately, no warning screen.

---

## Action plan (do in order — Steps 1 + 2 unblock prod immediately)

### Step 1 — Fix Supabase Auth redirect (5 min, P0)

Supabase Dashboard → Authentication → URL Configuration:

```
Site URL:                    https://truemirror.vercel.app
Additional Redirect URLs:    https://truemirror.vercel.app/**
                             https://truemirror.vercel.app/auth/callback
                             http://localhost:3000/**     ← keep for local dev
```

### Step 2 — Confirm `signInWithOAuth()` passes explicit `redirectTo` (10 min, P0)

Search frontend for `signInWithOAuth` calls. Each must pass `redirectTo` so we don't depend on `Site URL` fallback:

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
})
```

Files to check:
- `frontend/app/login/**`
- `frontend/app/signup/**`
- `frontend/components/**` (any auth button components)
- `frontend/lib/auth.ts` or similar

Also confirm `frontend/app/auth/callback/page.tsx` exists and handles the `?code=` exchange via `supabase.auth.exchangeCodeForSession()`. If missing, the redirect will succeed but session won't be set.

### Step 3 — Brand Google OAuth Consent Screen (15 min, P0, manual)

Google Cloud Console → APIs & Services → OAuth consent screen → Edit App:

| Field | Value |
|---|---|
| App name | `Myro` |
| User support email | `shivam.pathak7july@gmail.com` |
| App logo | Myro logo, 120x120 PNG, < 1 MB |
| Application home page | `https://truemirror.vercel.app` (or `https://himyro.com` if canonical) |
| Application privacy policy | `https://truemirror.vercel.app/privacy` |
| Application terms of service | `https://truemirror.vercel.app/terms` |
| Authorized domains | `vercel.app`, `himyro.com`, `supabase.co` |
| Developer contact | `shivam.pathak7july@gmail.com` |

### Step 4 — Confirm `/privacy` and `/terms` pages exist on production (P0)

These must return 200 and be reachable without auth. Google will reject the consent screen update if they 404.

Files to check / create if missing:
- `frontend/app/privacy/page.tsx`
- `frontend/app/terms/page.tsx`

### Step 5 — Publish OAuth consent screen (P1, after Step 3)

Google Cloud Console → OAuth consent screen → **Publish App** (Testing → In production). With basic scopes (`openid email profile`) no formal verification is required. Goes live for all users immediately.

### Step 6 — Domain ownership verification (P2, this week)

Verify `truemirror.vercel.app` and `himyro.com` ownership in Google Search Console. The consent screen will then show "from himyro.com" — extra trust signal.

### Step 7 — Custom Supabase domain (P3, v2)

Pro plan addon ($10/mo). `auth.himyro.com` instead of `gipvxuugajkugntwkeiz.supabase.co`. Cosmetic only after Steps 1–5 are done — most users won't notice the supabase string in tiny print, but custom domain removes it entirely.

---

## Verification — Test after Steps 1–5

1. Open Incognito window → `https://truemirror.vercel.app`
2. Click "Sign in with Google"
3. **Expected:** Consent screen says "Sign in to **Myro**" with logo
4. Pick a Google account → click Continue
5. **Expected:** Redirected to `https://truemirror.vercel.app/auth/callback?code=...` → then to dashboard
6. **NOT expected:** localhost, 404, "this app isn't verified" warning, "access blocked" error

Also test with a Google account that has never signed in before (true new-user flow), not just one already in the test users list.

---

## Files likely touched (for the code parts)

- `frontend/app/login/page.tsx` — `signInWithOAuth` call site
- `frontend/app/signup/page.tsx` — `signInWithOAuth` call site
- `frontend/app/auth/callback/page.tsx` — code exchange handler (verify exists)
- `frontend/app/privacy/page.tsx` — create if missing
- `frontend/app/terms/page.tsx` — create if missing

No backend changes required. No DB migrations. No environment variable changes (Supabase URL Configuration is dashboard-only).

---

## Out of scope (do not touch this incident)

- Don't create a new Supabase project to "rename" it — see Problem 1 root cause.
- Don't add new OAuth scopes — basic `openid email profile` is enough for Supabase Google auth and avoids triggering verification requirements.
- Don't change anything in `backend/app/routers/auth/**` — auth is fully Supabase-managed on the client.

---

## Decisions locked

- **Stay on supabase.co domain for now.** Custom auth domain is v2 (Step 7) — not blocking sign-in, just cosmetic.
- **Use basic scopes only** (`openid email profile`). Avoid sensitive scopes that require Google verification (4–6 week review).
- **App name = "Myro"**, not "Mirror" — consistent with the rename that's already in flight elsewhere in the codebase.
